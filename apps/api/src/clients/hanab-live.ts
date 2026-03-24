// HTTP client for the hanab.live public API.
//
// Seed format used by hanab.live: p{numPlayers}v{variantId}s{suffix}
// e.g. p3v0se1s3g1 = 3-player, No Variant, suffix "e1s3g1"
//
// Endpoints used:
//   GET /api/v1/seed/{fullSeed}?size=100&page=N&col[0]=0
//     — all games played with this seed, paginated oldest-first
//   GET /export/{gameId}
//     — full export: players, deck, actions (no score/options in response)
//
// Server-side rate limiting (from vendored hanab-live source):
//   - The HTTP tollbooth rate limiter is currently commented out; no enforced
//     per-request HTTP limit.  WebSocket rate limiting (200 msg/2s) does not
//     apply to our HTTP-only usage.
//   - apiCheckIPBanned() runs on every API request; excessive burst traffic
//     can result in an admin IP ban.
//   - We apply a COURTESY_DELAY_MS gap between outgoing requests to stay well
//     below any undocumented threshold.
//
// Pagination (from vendored api_misc.go):
//   - apiSeed uses ?size= (max 100, default 10) and ?page= (0-based).
//   - The response envelope is { total_rows, info, rows[] }; we use total_rows
//     to know when we have all games without relying on heuristics.
//   - ?col[0]=0 sorts by games.id ASC for stable, deterministic pagination.
//   - The old ?start= cursor approach is NOT recognised by apiSeed; we now use
//     proper page-based pagination.
//
// Reliability features:
//   - Courtesy inter-request delay (COURTESY_DELAY_MS) to avoid burst behaviour
//   - Retry with exponential backoff (MAX_RETRIES attempts) on transient errors
//     (timeouts, 429 Too Many Requests, 5xx); honours Retry-After header on 429
//   - Separate timeouts: 15 s for seed list, 30 s for game export (larger payload)
//   - Short-lived in-memory cache for game exports (TTL = 10 min) so that
//     repeated ingestion runs don't re-fetch the same completed game

// In simulation mode the mock hanab-live routes are mounted on this same
// server, so requests loop back to localhost.  The port is whatever Render (or
// the dev environment) assigns via $PORT / $BACKEND_PORT.  An explicit
// HANAB_LIVE_BASE_URL overrides both defaults (useful for local dev).
const _defaultBase =
  process.env.SIMULATION_MODE === 'true'
    ? `http://localhost:${process.env.PORT ?? process.env.BACKEND_PORT ?? 4000}`
    : 'https://hanab.live';
const BASE = process.env.HANAB_LIVE_BASE_URL ?? _defaultBase;
const SEED_TIMEOUT_MS = 15_000;
const EXPORT_TIMEOUT_MS = 30_000;

// Retry config
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1_000;
const MAX_RETRY_AFTER_MS = 60_000; // cap Retry-After header at 60 s

// Courtesy inter-request delay: prevents back-to-back bursts.
// hanab.live has no active HTTP rate limiter in the vendored code, but admin
// IP bans are still possible for abusive traffic patterns.
const COURTESY_DELAY_MS = 100;

// Seed list: request exactly this many rows per page (server max is 100)
const SEED_PAGE_SIZE = 100;

// Export cache: TTL 10 minutes
const EXPORT_CACHE_TTL_MS = 10 * 60 * 1_000;

type CacheEntry = { exp: GameExport; expiresAt: number };
const exportCache = new Map<number, CacheEntry>();

// ---------------------------------------------------------------------------
// Low-level fetch helpers
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns true for status codes that are worth retrying:
 *   - AbortError (timeout)
 *   - 429 Too Many Requests
 *   - 5xx Server Errors
 */
function isRetryable(err: unknown, status?: number): boolean {
  if (err instanceof Error && err.name === 'AbortError') return true;
  if (status !== undefined && (status === 429 || status >= 500)) return true;
  return false;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches a URL with timeout + exponential-backoff retry.
 * Only retries on transient errors (timeout, 429, 5xx).
 * On 429, honours the Retry-After response header (capped at MAX_RETRY_AFTER_MS).
 */
async function fetchWithRetry(url: string, timeoutMs: number): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 1 s, 2 s, 4 s …
      await sleep(RETRY_BASE_MS * Math.pow(2, attempt - 1));
    }
    let res: Response;
    try {
      res = await fetchWithTimeout(url, timeoutMs);
    } catch (err) {
      lastErr = err;
      if (isRetryable(err)) continue;
      throw err;
    }

    if (res.status === 429) {
      // Respect Retry-After header when present; otherwise use backoff
      const retryAfterSec = parseFloat(res.headers.get('Retry-After') ?? '');
      const waitMs = Number.isFinite(retryAfterSec)
        ? Math.min(retryAfterSec * 1_000, MAX_RETRY_AFTER_MS)
        : RETRY_BASE_MS * Math.pow(2, attempt);
      await sleep(waitMs);
      lastErr = new Error('HTTP 429');
      continue;
    }

    if (isRetryable(null, res.status)) {
      lastErr = new Error(`HTTP ${res.status}`);
      continue;
    }
    return res;
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Courtesy throttle
// ---------------------------------------------------------------------------

let lastFetchAt = 0;

/**
 * Enforces a minimum gap of COURTESY_DELAY_MS between outgoing requests
 * to avoid appearing as a burst to hanab.live.
 */
async function courtesyDelay(): Promise<void> {
  const elapsed = Date.now() - lastFetchAt;
  if (lastFetchAt > 0 && elapsed < COURTESY_DELAY_MS) {
    await sleep(COURTESY_DELAY_MS - elapsed);
  }
  lastFetchAt = Date.now();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SeedGame = {
  id: number;
  score: number;
  numPlayers: number;
  // ISO timestamp strings — may be under various key names
  datetimeStarted: string | null;
  datetimeFinished: string | null;
  // Comma-separated tag string from hanab.live game_tags table, already split into array.
  // e.g. ["convention:h-group", "convention:rs"]
  tags: string[];
};

export type ExportAction = {
  type: number; // 0=Play, 1=Discard, 2=ColorClue, 3=RankClue, 4=GameOver
  target: number;
  value: number;
};

export type ExportDeckCard = {
  suitIndex: number;
  rank: number;
};

export type GameExport = {
  gameId: number;
  players: string[]; // hanab.live display names, in seat order
  seed: string; // full hanab.live seed string
  score: number;
  endCondition: number;
  options: {
    variantID?: number;
    cardCycle?: boolean;
    deckPlays?: boolean;
    emptyClues?: boolean;
    oneExtraCard?: boolean;
    oneLessCard?: boolean;
    allOrNothing?: boolean;
    detrimentalCharacters?: boolean;
  };
  datetimeStarted: string | null;
  datetimeFinished: string | null;
  // Present in the export response; may be absent for very old games
  actions: ExportAction[];
  deck: ExportDeckCard[];
};

// ---------------------------------------------------------------------------
// Normalise helpers (hanab.live occasionally renames fields)
// ---------------------------------------------------------------------------

function coerceId(obj: Record<string, unknown>): number | null {
  for (const k of ['id', 'gameId', 'game_id']) {
    if (typeof obj[k] === 'number') return obj[k] as number;
  }
  return null;
}

function coerceScore(obj: Record<string, unknown>): number {
  for (const k of ['score', 'Score']) {
    if (typeof obj[k] === 'number') return obj[k] as number;
  }
  return 0;
}

function coercePlayers(obj: Record<string, unknown>): string[] {
  for (const k of ['players', 'playerNames', 'player_names']) {
    const v = obj[k];
    if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v as string[];
    if (
      Array.isArray(v) &&
      v.every((x) => x && typeof (x as Record<string, unknown>).name === 'string')
    ) {
      return (v as Array<{ name: string }>).map((p) => p.name);
    }
  }
  return [];
}

function coerceTimestamp(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    if (typeof obj[k] === 'string') return obj[k] as string;
  }
  return null;
}

function coerceBool(
  obj: Record<string, unknown>,
  key: string,
  optObj?: Record<string, unknown>,
): boolean {
  const v = obj[key] ?? optObj?.[key];
  return v === true;
}

// ---------------------------------------------------------------------------
// Row parsers
// ---------------------------------------------------------------------------

function parseTags(obj: Record<string, unknown>): string[] {
  // hanab.live returns tags as a comma-separated string (e.g. "convention:h-group, convention:rs")
  const raw = obj.tags ?? obj.tag ?? '';
  if (typeof raw !== 'string' || !raw.trim()) return [];
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function parseSeedRows(rows: unknown[]): SeedGame[] {
  const games: SeedGame[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const obj = row as Record<string, unknown>;
    const id = coerceId(obj);
    if (id === null) continue;
    games.push({
      id,
      score: coerceScore(obj),
      numPlayers: typeof obj.numPlayers === 'number' ? obj.numPlayers : 0,
      datetimeStarted: coerceTimestamp(obj, ['datetimeStarted', 'datetime_started', 'started_at']),
      datetimeFinished: coerceTimestamp(obj, [
        'datetimeFinished',
        'datetime_finished',
        'played_at',
        'ended_at',
      ]),
      tags: parseTags(obj),
    });
  }
  return games;
}

function extractRows(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj?.games)) return obj.games as unknown[];
  if (Array.isArray(obj?.rows)) return obj.rows as unknown[];
  return [];
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

/**
 * Returns all games played with the given full hanab.live seed string,
 * sorted oldest-first.  The seed format is p{n}v{variantId}s{suffix}.
 *
 * Pagination: uses ?size=100&page=N&col[0]=0 (sort by game ID ascending for
 * stable pagination).  The server returns { total_rows, rows[] }; we stop
 * when allGames.size >= total_rows or we receive a partial page.
 */
export async function fetchGamesBySeed(fullSeed: string): Promise<SeedGame[]> {
  const allGames = new Map<number, SeedGame>();
  let page = 0;

  while (true) {
    // col%5B0%5D=0 → col[0]=0 → sort by games.id ASC (stable page order)
    const url = `${BASE}/api/v1/seed/${encodeURIComponent(fullSeed)}?size=${SEED_PAGE_SIZE}&page=${page}&col%5B0%5D=0`;

    await courtesyDelay();
    let res: Response;
    try {
      res = await fetchWithRetry(url, SEED_TIMEOUT_MS);
    } catch (err) {
      if (allGames.size > 0) break; // return what we have if first page already succeeded
      throw err;
    }

    if (res.status === 404) break;
    if (!res.ok) throw new Error(`hanab.live seed API error ${res.status} for seed ${fullSeed}`);

    let raw: unknown;
    try {
      raw = await res.json();
    } catch {
      break;
    }

    const rows = extractRows(raw);
    const pageGames = parseSeedRows(rows);

    let newThisPage = 0;
    for (const g of pageGames) {
      if (!allGames.has(g.id)) {
        allGames.set(g.id, g);
        newThisPage++;
      }
    }

    // Use total_rows from the response envelope when available — this gives an
    // exact stopping condition without relying on page-size heuristics.
    const envelope = !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
    const totalRows =
      typeof envelope?.total_rows === 'number' ? (envelope.total_rows as number) : null;

    if (totalRows !== null && allGames.size >= totalRows) break; // have everything
    if (newThisPage < SEED_PAGE_SIZE) break; // partial page → last page

    page++;
  }

  const games = [...allGames.values()];
  games.sort((a, b) => {
    const ta = a.datetimeStarted ?? a.datetimeFinished ?? '';
    const tb = b.datetimeStarted ?? b.datetimeFinished ?? '';
    return ta < tb ? -1 : ta > tb ? 1 : a.id - b.id;
  });
  return games;
}

/**
 * Fetches the full export for a single game.
 * Results are cached for EXPORT_CACHE_TTL_MS to avoid duplicate fetches
 * within an ingestion run.
 */
export async function fetchGameExport(gameId: number): Promise<GameExport | null> {
  // Check cache
  const now = Date.now();
  const cached = exportCache.get(gameId);
  if (cached && cached.expiresAt > now) {
    return cached.exp;
  }

  const url = `${BASE}/export/${gameId}`;
  await courtesyDelay();
  let res: Response;
  try {
    res = await fetchWithRetry(url, EXPORT_TIMEOUT_MS);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`timeout fetching export for game ${gameId}`);
    }
    throw err;
  }

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`hanab.live export API error ${res.status} for game ${gameId}`);

  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    return null;
  }

  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id = coerceId(obj) ?? gameId;
  const players = coercePlayers(obj);
  if (players.length === 0) return null;

  const options = (obj.options && typeof obj.options === 'object' ? obj.options : {}) as Record<
    string,
    unknown
  >;

  const endCondition =
    typeof obj.endCondition === 'number'
      ? obj.endCondition
      : typeof obj.end_condition === 'number'
        ? obj.end_condition
        : 1;

  const rawActions = Array.isArray(obj.actions) ? (obj.actions as unknown[]) : [];
  const actions: ExportAction[] = rawActions
    .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
    .map((a) => ({
      type: typeof a.type === 'number' ? a.type : 0,
      target: typeof a.target === 'number' ? a.target : 0,
      value: typeof a.value === 'number' ? a.value : 0,
    }));

  const rawDeck = Array.isArray(obj.deck) ? (obj.deck as unknown[]) : [];
  const deck: ExportDeckCard[] = rawDeck
    .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object')
    .map((d) => ({
      suitIndex: typeof d.suitIndex === 'number' ? d.suitIndex : 0,
      rank: typeof d.rank === 'number' ? d.rank : 0,
    }));

  const exp: GameExport = {
    gameId: id,
    players,
    seed: typeof obj.seed === 'string' ? obj.seed : '',
    score: coerceScore(obj),
    endCondition,
    options: {
      variantID:
        typeof options.variantID === 'number'
          ? options.variantID
          : typeof options.variant_id === 'number'
            ? (options.variant_id as number)
            : undefined,
      cardCycle: coerceBool(obj, 'cardCycle', options),
      deckPlays: coerceBool(obj, 'deckPlays', options),
      emptyClues: coerceBool(obj, 'emptyClues', options),
      oneExtraCard: coerceBool(obj, 'oneExtraCard', options),
      oneLessCard: coerceBool(obj, 'oneLessCard', options),
      allOrNothing: coerceBool(obj, 'allOrNothing', options),
      detrimentalCharacters: coerceBool(obj, 'detrimentalCharacters', options),
    },
    datetimeStarted: coerceTimestamp(obj, ['datetimeStarted', 'datetime_started', 'started_at']),
    datetimeFinished: coerceTimestamp(obj, [
      'datetimeFinished',
      'datetime_finished',
      'played_at',
      'ended_at',
    ]),
    actions,
    deck,
  };

  exportCache.set(gameId, { exp, expiresAt: now + EXPORT_CACHE_TTL_MS });
  return exp;
}

/**
 * Construct the full hanab.live seed string from our stored parts.
 */
export function buildFullSeed(teamSize: number, variantId: number, seedSuffix: string): string {
  return `p${teamSize}v${variantId}s${seedSuffix}`;
}
