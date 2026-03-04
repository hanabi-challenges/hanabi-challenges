export function encodeRoundSeedPayload(input: {
  variant?: string | null;
  seed?: string | null;
}): string | null {
  const variant = input.variant?.trim() ?? '';
  const seed = input.seed?.trim() ?? '';
  if (!variant && !seed) return null;
  return JSON.stringify({
    variant: variant || null,
    seed: seed || null,
  });
}

export function parseGameId(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const matchUrl = trimmed.match(/(?:replay|shared-replay)\/(\d+)/i);
  const matchId = trimmed.match(/^\d+$/);
  return matchUrl ? matchUrl[1] : matchId ? matchId[0] : null;
}

export function parseSeedPayload(seedPayload: string | null): {
  variant: string | null;
  seed: string | null;
} {
  if (!seedPayload) return { variant: null, seed: null };
  try {
    const parsed = JSON.parse(seedPayload) as { variant?: unknown; seed?: unknown };
    return {
      variant: typeof parsed.variant === 'string' ? parsed.variant : null,
      seed: typeof parsed.seed === 'string' ? parsed.seed : null,
    };
  } catch {
    return { variant: null, seed: seedPayload };
  }
}

export function normalizeVariantName(variant: string | null | undefined): string {
  if (!variant) return '';
  return variant
    .replace(/\s*\(#\d+\)\s*$/, '')
    .trim()
    .toLowerCase();
}

export async function fetchJsonWithTimeout(url: string, ms = 4000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) {
      throw new Error(`Request failed (${resp.status})`);
    }
    return await resp.json();
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') {
      throw new Error('timeout');
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}
