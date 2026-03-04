import { pool } from '../../config/db';
import { partitionHybrid34, shuffleInPlace } from './session-ladder.assignment';
import type { PoolClient } from 'pg';

export type SessionLadderConfig = {
  event_id: number;
  team_size_mode: 'fixed' | 'hybrid_3_4';
  team_size: number | null;
  k_factor: number;
  participation_bonus: number;
  rounds_per_session: number;
  random_seed_salt: string | null;
};

export type EventSession = {
  id: number;
  event_id: number;
  session_index: number;
  starts_at: string | null;
  ends_at: string | null;
  status: 'scheduled' | 'live' | 'closed';
  round_count: number;
};

export type EventSessionRound = {
  id: number;
  session_id: number;
  round_index: number;
  seed_payload: string | null;
  status: 'pending' | 'assigning' | 'playing' | 'scoring' | 'finalized';
};

export type StandingsRow = {
  user_id: number;
  display_name: string;
  rating: number;
  games_played: number;
  sessions_played: number;
  last_played_at: string | null;
};

export type HistoryRow = {
  ledger_id: number;
  event_id: number;
  session_id: number;
  session_index: number;
  round_id: number;
  round_index: number;
  user_id: number;
  display_name: string;
  old_rating: number;
  delta_competitive: number;
  delta_participation: number;
  new_rating: number;
  created_at: string;
};

export type SessionPlacementRow = {
  session_id: number;
  session_index: number;
  round_id: number;
  round_index: number;
  user_id: number;
  display_name: string;
  placement: number;
};

export type SessionEloRow = {
  session_id: number;
  session_index: number;
  user_id: number;
  display_name: string;
  starting_elo: number;
  final_elo: number;
  elo_delta: number;
};

let readyCheckTablesEnsured = false;
let roundResultReplayColumnEnsured = false;
const readyCheckFinalizeTimers = new Map<number, ReturnType<typeof setTimeout>>();

async function ensureReadyCheckTables(): Promise<void> {
  if (readyCheckTablesEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_session_ready_checks (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL UNIQUE REFERENCES event_sessions(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('open', 'closed')) DEFAULT 'open',
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ends_at TIMESTAMPTZ NOT NULL,
      initiated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      closed_at TIMESTAMPTZ NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_session_ready_check_responses (
      ready_check_id INTEGER NOT NULL REFERENCES event_session_ready_checks(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      is_ready BOOLEAN NOT NULL,
      responded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (ready_check_id, user_id)
    )
  `);
  readyCheckTablesEnsured = true;
}

async function ensureRoundResultReplayColumn(): Promise<void> {
  if (roundResultReplayColumnEnsured) return;
  await pool.query(`
    ALTER TABLE event_session_round_team_results
    ADD COLUMN IF NOT EXISTS replay_game_id BIGINT NULL
  `);
  roundResultReplayColumnEnsured = true;
}

async function finalizeActiveRoundsWithForfeitsTx(
  client: PoolClient,
  sessionId: number,
): Promise<number[]> {
  const activeRoundsRes = await client.query<{ id: number }>(
    `
    SELECT id
    FROM event_session_rounds
    WHERE session_id = $1
      AND status IN ('assigning', 'playing', 'scoring')
    ORDER BY round_index
    `,
    [sessionId],
  );
  if (activeRoundsRes.rowCount === 0) return [];

  for (const row of activeRoundsRes.rows) {
    await client.query(
      `
      INSERT INTO event_session_round_team_results (
        round_id,
        team_no,
        score,
        submitted_by_user_id,
        submitted_at
      )
      SELECT
        $1,
        t.team_no,
        0,
        NULL,
        NOW()
      FROM (
        SELECT DISTINCT assigned_team_no AS team_no
        FROM event_session_round_players
        WHERE round_id = $1
          AND role = 'playing'
          AND assigned_team_no IS NOT NULL
      ) t
      LEFT JOIN event_session_round_team_results existing
        ON existing.round_id = $1
       AND existing.team_no = t.team_no
      WHERE existing.id IS NULL
      `,
      [row.id],
    );
    await client.query(
      `
      UPDATE event_session_rounds
      SET status = 'finalized'
      WHERE id = $1
      `,
      [row.id],
    );
  }
  return activeRoundsRes.rows.map((row) => row.id);
}

function scheduleReadyCheckFinalize(sessionId: number, durationMs: number): void {
  const existing = readyCheckFinalizeTimers.get(sessionId);
  if (existing) clearTimeout(existing);
  const handle = setTimeout(async () => {
    try {
      await finalizeReadyCheckAndAssignNextRound({ sessionId });
    } catch {
      // best-effort
    } finally {
      const current = readyCheckFinalizeTimers.get(sessionId);
      if (current === handle) {
        readyCheckFinalizeTimers.delete(sessionId);
      }
    }
  }, durationMs);
  readyCheckFinalizeTimers.set(sessionId, handle);
}

export async function startReadyCheckForNextRound(input: {
  sessionId: number;
  initiatedByUserId: number;
  durationSeconds?: number;
}) {
  await ensureReadyCheckTables();
  const { sessionId, initiatedByUserId, durationSeconds = 10 } = input;
  const client = await pool.connect();
  let finalizedRoundIds: number[] = [];
  try {
    await client.query('BEGIN');

    finalizedRoundIds = await finalizeActiveRoundsWithForfeitsTx(client, sessionId);

    await client.query(
      `
      UPDATE event_session_presence
      SET role = 'playing', updated_at = NOW(), last_seen_at = NOW()
      WHERE session_id = $1
        AND state = 'online'
      `,
      [sessionId],
    );

    const nextRoundRes = await client.query<{
      id: number;
      seed_payload: string | null;
    }>(
      `
      SELECT id, seed_payload
      FROM event_session_rounds
      WHERE session_id = $1
        AND status = 'pending'
      ORDER BY round_index
      LIMIT 1
      `,
      [sessionId],
    );
    if (nextRoundRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return { blocked: true as const, reason: 'NO_PENDING_ROUNDS' as const };
    }
    const nextRound = nextRoundRes.rows[0];
    if (!nextRound.seed_payload) {
      await client.query('ROLLBACK');
      return { blocked: true as const, reason: 'SEED_REQUIRED' as const, round_id: nextRound.id };
    }

    await client.query(
      `DELETE FROM event_session_ready_check_responses WHERE ready_check_id IN (
      SELECT id FROM event_session_ready_checks WHERE session_id = $1
    )`,
      [sessionId],
    );

    const readyCheckRes = await client.query<{
      id: number;
      ends_at: string;
      started_at: string;
    }>(
      `
      INSERT INTO event_session_ready_checks (session_id, status, started_at, ends_at, initiated_by_user_id, closed_at)
      VALUES ($1, 'open', NOW(), NOW() + ($2::text || ' seconds')::interval, $3, NULL)
      ON CONFLICT (session_id)
      DO UPDATE SET
        status = 'open',
        started_at = NOW(),
        ends_at = NOW() + ($2::text || ' seconds')::interval,
        initiated_by_user_id = EXCLUDED.initiated_by_user_id,
        closed_at = NULL
      RETURNING id, started_at, ends_at
      `,
      [sessionId, durationSeconds, initiatedByUserId],
    );

    await client.query('COMMIT');
    for (const roundId of finalizedRoundIds) {
      try {
        await finalizeRoundElo(roundId);
      } catch (err) {
        const message = (err as Error).message;
        if (message !== 'NEED_AT_LEAST_ONE_TEAM' && message !== 'ROUND_NOT_FOUND') {
          console.error('Failed to finalize round ELO after ready-check start', { roundId, err });
        }
      }
    }
    scheduleReadyCheckFinalize(sessionId, durationSeconds * 1000 + 250);
    return {
      blocked: false as const,
      ready_check_id: readyCheckRes.rows[0].id,
      started_at: readyCheckRes.rows[0].started_at,
      ends_at: readyCheckRes.rows[0].ends_at,
      duration_seconds: durationSeconds,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function submitReadyCheckResponse(input: {
  sessionId: number;
  userId: number;
  isReady: boolean;
}) {
  await ensureReadyCheckTables();
  const { sessionId, userId, isReady } = input;
  const readyCheckRes = await pool.query<{ id: number; status: 'open' | 'closed' }>(
    `
    SELECT id, status
    FROM event_session_ready_checks
    WHERE session_id = $1
    `,
    [sessionId],
  );
  if (readyCheckRes.rowCount === 0)
    return { ok: false as const, reason: 'NO_READY_CHECK' as const };
  const readyCheck = readyCheckRes.rows[0];
  if (readyCheck.status !== 'open')
    return { ok: false as const, reason: 'READY_CHECK_CLOSED' as const };

  await pool.query(
    `
    UPDATE event_session_presence
    SET role = 'playing', state = 'online', updated_at = NOW(), last_seen_at = NOW()
    WHERE session_id = $1
      AND user_id = $2
    `,
    [sessionId, userId],
  );

  await pool.query(
    `
    INSERT INTO event_session_ready_check_responses (ready_check_id, user_id, is_ready, responded_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (ready_check_id, user_id)
    DO UPDATE SET is_ready = EXCLUDED.is_ready, responded_at = NOW()
    `,
    [readyCheck.id, userId, isReady],
  );

  if (isReady) {
    try {
      const [onlineParticipantsRes, readyRes] = await Promise.all([
        pool.query<{ count: string }>(
          `
          SELECT COUNT(*)::int AS count
          FROM event_session_presence
          WHERE session_id = $1
            AND state = 'online'
          `,
          [sessionId],
        ),
        pool.query<{ count: string }>(
          `
          SELECT COUNT(*)::int AS count
          FROM event_session_ready_check_responses
          WHERE ready_check_id = $1
            AND is_ready = TRUE
          `,
          [readyCheck.id],
        ),
      ]);

      const onlineParticipants = Number(onlineParticipantsRes.rows[0]?.count ?? 0);
      const readyCount = Number(readyRes.rows[0]?.count ?? 0);
      if (onlineParticipants > 0 && readyCount >= onlineParticipants) {
        await finalizeReadyCheckAndAssignNextRound({ sessionId });
      }
    } catch {
      // Best-effort early finalize; fallback path is expiry-based finalize.
    }
  }

  return { ok: true as const };
}

export async function finalizeReadyCheckAndAssignNextRound(input: { sessionId: number }) {
  await ensureReadyCheckTables();
  const { sessionId } = input;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const readyCheckRes = await client.query<{ id: number; status: 'open' | 'closed' }>(
      `
      SELECT id, status
      FROM event_session_ready_checks
      WHERE session_id = $1
      FOR UPDATE
      `,
      [sessionId],
    );
    if (readyCheckRes.rowCount === 0 || readyCheckRes.rows[0].status !== 'open') {
      await client.query('ROLLBACK');
      return { blocked: true as const, reason: 'NO_OPEN_READY_CHECK' as const };
    }
    const readyCheckId = readyCheckRes.rows[0].id;

    const onlineParticipantsRes = await client.query<{ user_id: number }>(
      `
      SELECT user_id
      FROM event_session_presence
      WHERE session_id = $1
        AND state = 'online'
      `,
      [sessionId],
    );
    const readyRes = await client.query<{ user_id: number }>(
      `
      SELECT user_id
      FROM event_session_ready_check_responses
      WHERE ready_check_id = $1
        AND is_ready = TRUE
      `,
      [readyCheckId],
    );

    const readySet = new Set(readyRes.rows.map((r) => r.user_id));
    const dropped = onlineParticipantsRes.rows
      .map((r) => r.user_id)
      .filter((userId) => !readySet.has(userId));

    if (dropped.length > 0) {
      await client.query(
        `
        UPDATE event_session_presence
        SET role = 'spectating', state = 'offline', updated_at = NOW(), last_seen_at = NOW()
        WHERE session_id = $1
          AND user_id = ANY($2::int[])
        `,
        [sessionId, dropped],
      );
    }

    await client.query(
      `
      UPDATE event_session_ready_checks
      SET status = 'closed', closed_at = NOW()
      WHERE id = $1
      `,
      [readyCheckId],
    );

    await client.query('COMMIT');
    const existing = readyCheckFinalizeTimers.get(sessionId);
    if (existing) {
      clearTimeout(existing);
      readyCheckFinalizeTimers.delete(sessionId);
    }

    const assignResult = await assignNextRound({
      sessionId,
      overrideMissingScores: true,
      overrideReason: 'READY_CHECK_FINALIZE',
    });

    if (assignResult.blocked) {
      return { blocked: true as const, reason: assignResult.reason, dropped_count: dropped.length };
    }

    return {
      blocked: false as const,
      dropped_count: dropped.length,
      round_id: assignResult.round_id,
      round_index: assignResult.round_index,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getSessionLadderEventBySlug(slug: string): Promise<{
  id: number;
  slug: string;
  event_format: 'challenge' | 'tournament' | 'session_ladder';
  owner_user_id: number | null;
} | null> {
  const result = await pool.query<{
    id: number;
    slug: string;
    event_format: 'challenge' | 'tournament' | 'session_ladder';
    owner_user_id: number | null;
  }>(
    `
    SELECT id, slug, event_format, owner_user_id
    FROM events
    WHERE slug = $1
    `,
    [slug],
  );
  return result.rowCount > 0 ? result.rows[0] : null;
}

export async function isEventDelegate(eventId: number, userId: number): Promise<boolean> {
  const result = await pool.query(
    `
    SELECT 1
    FROM event_admins
    WHERE event_id = $1 AND user_id = $2
    `,
    [eventId, userId],
  );
  return result.rowCount > 0;
}

export async function canManageEvent(input: {
  eventId: number;
  userId: number;
  userRole: 'SUPERADMIN' | 'ADMIN' | 'USER';
}): Promise<boolean> {
  const { eventId, userId, userRole } = input;
  if (userRole === 'SUPERADMIN') return true;

  const eventResult = await pool.query<{ owner_user_id: number | null }>(
    `SELECT owner_user_id FROM events WHERE id = $1`,
    [eventId],
  );
  if (eventResult.rowCount === 0) return false;
  if (eventResult.rows[0].owner_user_id === userId) return true;

  return isEventDelegate(eventId, userId);
}

export async function listEventDelegates(
  eventId: number,
): Promise<Array<{ user_id: number; display_name: string; role: string }>> {
  const result = await pool.query<{ user_id: number; display_name: string; role: string }>(
    `
    SELECT ea.user_id, u.display_name, u.role
    FROM event_admins ea
    JOIN users u ON u.id = ea.user_id
    WHERE ea.event_id = $1
    ORDER BY u.display_name
    `,
    [eventId],
  );
  return result.rows;
}

export async function addEventDelegate(eventId: number, userId: number): Promise<void> {
  await pool.query(
    `
    INSERT INTO event_admins (event_id, user_id)
    VALUES ($1, $2)
    ON CONFLICT (event_id, user_id) DO NOTHING
    `,
    [eventId, userId],
  );
}

export async function removeEventDelegate(eventId: number, userId: number): Promise<void> {
  await pool.query(
    `
    DELETE FROM event_admins
    WHERE event_id = $1 AND user_id = $2
    `,
    [eventId, userId],
  );
}

export async function upsertSessionLadderConfig(input: {
  eventId: number;
  teamSizeMode?: 'fixed' | 'hybrid_3_4';
  teamSize?: number | null;
  kFactor?: number;
  participationBonus?: number;
  roundsPerSession?: number;
  randomSeedSalt?: string | null;
}): Promise<SessionLadderConfig> {
  const {
    eventId,
    teamSizeMode = 'hybrid_3_4',
    teamSize = null,
    kFactor = 24,
    participationBonus = 0.5,
    roundsPerSession = 1,
    randomSeedSalt = null,
  } = input;

  const result = await pool.query<SessionLadderConfig>(
    `
    INSERT INTO event_session_ladder_config (
      event_id,
      team_size_mode,
      team_size,
      k_factor,
      participation_bonus,
      rounds_per_session,
      random_seed_salt
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (event_id)
    DO UPDATE SET
      team_size_mode = EXCLUDED.team_size_mode,
      team_size = EXCLUDED.team_size,
      k_factor = EXCLUDED.k_factor,
      participation_bonus = EXCLUDED.participation_bonus,
      rounds_per_session = EXCLUDED.rounds_per_session,
      random_seed_salt = EXCLUDED.random_seed_salt,
      updated_at = NOW()
    RETURNING
      event_id,
      team_size_mode,
      team_size,
      k_factor,
      participation_bonus::float8 AS participation_bonus,
      rounds_per_session,
      random_seed_salt
    `,
    [
      eventId,
      teamSizeMode,
      teamSize,
      kFactor,
      participationBonus,
      roundsPerSession,
      randomSeedSalt,
    ],
  );

  return result.rows[0];
}

export async function getSessionLadderConfig(eventId: number): Promise<SessionLadderConfig | null> {
  const result = await pool.query<SessionLadderConfig>(
    `
    SELECT
      event_id,
      team_size_mode,
      team_size,
      k_factor,
      participation_bonus::float8 AS participation_bonus,
      rounds_per_session,
      random_seed_salt
    FROM event_session_ladder_config
    WHERE event_id = $1
    `,
    [eventId],
  );
  return result.rowCount > 0 ? result.rows[0] : null;
}

export async function generateSessions(input: {
  eventId: number;
  sessionCount: number;
  roundsPerSession: number;
  startsAt?: string | null;
  intervalDays?: number;
  clearExisting?: boolean;
}): Promise<EventSession[]> {
  const {
    eventId,
    sessionCount,
    roundsPerSession,
    startsAt = null,
    intervalDays = 7,
    clearExisting = false,
  } = input;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (clearExisting) {
      await client.query(
        `
        DELETE FROM event_sessions
        WHERE event_id = $1
        `,
        [eventId],
      );
    }

    const sessions: EventSession[] = [];
    for (let i = 1; i <= sessionCount; i += 1) {
      const start = startsAt ? new Date(startsAt) : null;
      const end = startsAt ? new Date(startsAt) : null;

      if (start && end) {
        start.setDate(start.getDate() + (i - 1) * intervalDays);
        end.setDate(end.getDate() + (i - 1) * intervalDays);
        end.setHours(23, 59, 59, 999);
      }

      const sessionRes = await client.query<{
        id: number;
        event_id: number;
        session_index: number;
        starts_at: string | null;
        ends_at: string | null;
        status: 'scheduled' | 'live' | 'closed';
      }>(
        `
        INSERT INTO event_sessions (event_id, session_index, starts_at, ends_at, status)
        VALUES ($1, $2, $3, $4, 'scheduled')
        RETURNING id, event_id, session_index, starts_at, ends_at, status
        `,
        [eventId, i, start ? start.toISOString() : null, end ? end.toISOString() : null],
      );

      const session = sessionRes.rows[0];
      for (let r = 1; r <= roundsPerSession; r += 1) {
        await client.query(
          `
          INSERT INTO event_session_rounds (session_id, round_index, seed_payload, status)
          VALUES ($1, $2, $3, 'pending')
          `,
          [session.id, r, `SL-${eventId}-${i}-${r}`],
        );
      }

      sessions.push({
        ...session,
        round_count: roundsPerSession,
      });
    }

    await client.query('COMMIT');
    return sessions;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function createSession(input: {
  eventId: number;
  startsAt?: string | null;
  endsAt?: string | null;
}): Promise<EventSession> {
  const { eventId, startsAt = null, endsAt = null } = input;
  const result = await pool.query<EventSession>(
    `
    WITH next_idx AS (
      SELECT COALESCE(MAX(session_index), 0) + 1 AS next_index
      FROM event_sessions
      WHERE event_id = $1
    )
    INSERT INTO event_sessions (event_id, session_index, starts_at, ends_at, status)
    SELECT $1, next_idx.next_index, $2, $3, 'scheduled'
    FROM next_idx
    RETURNING id, event_id, session_index, starts_at, ends_at, status, 0::int AS round_count
    `,
    [eventId, startsAt, endsAt],
  );
  return result.rows[0];
}

export async function createSessionRound(input: {
  sessionId: number;
  seedPayload?: string | null;
}): Promise<EventSessionRound> {
  const { sessionId, seedPayload = null } = input;
  const result = await pool.query<EventSessionRound>(
    `
    WITH next_idx AS (
      SELECT COALESCE(MAX(round_index), 0) + 1 AS next_index
      FROM event_session_rounds
      WHERE session_id = $1
    )
    INSERT INTO event_session_rounds (session_id, round_index, seed_payload, status)
    SELECT $1, next_idx.next_index, $2, 'pending'
    FROM next_idx
    RETURNING id, session_id, round_index, seed_payload, status
    `,
    [sessionId, seedPayload],
  );
  return result.rows[0];
}

export async function listSessionsForEvent(eventId: number): Promise<EventSession[]> {
  const result = await pool.query<EventSession>(
    `
    SELECT
      s.id,
      s.event_id,
      s.session_index,
      s.starts_at,
      s.ends_at,
      s.status,
      COUNT(r.id)::int AS round_count
    FROM event_sessions s
    LEFT JOIN event_session_rounds r ON r.session_id = s.id
    WHERE s.event_id = $1
    GROUP BY s.id
    ORDER BY s.session_index
    `,
    [eventId],
  );
  return result.rows;
}

export async function setSessionPresence(input: {
  sessionId: number;
  userId: number;
  role: 'playing' | 'spectating';
  state: 'online' | 'offline';
}) {
  const { sessionId, userId, role, state } = input;
  await pool.query(
    `
    INSERT INTO event_session_presence (session_id, user_id, role, state, last_seen_at, updated_at)
    VALUES ($1, $2, $3, $4, NOW(), NOW())
    ON CONFLICT (session_id, user_id)
    DO UPDATE SET
      role = EXCLUDED.role,
      state = EXCLUDED.state,
      last_seen_at = NOW(),
      updated_at = NOW()
    `,
    [sessionId, userId, role, state],
  );
}

export async function getSessionState(sessionId: number) {
  await ensureReadyCheckTables();
  await ensureRoundResultReplayColumn();
  try {
    const readyCheckStatus = await pool.query<{ status: 'open' | 'closed'; ends_at: string }>(
      `
      SELECT status, ends_at
      FROM event_session_ready_checks
      WHERE session_id = $1
      `,
      [sessionId],
    );
    if (
      readyCheckStatus.rowCount > 0 &&
      readyCheckStatus.rows[0].status === 'open' &&
      new Date(readyCheckStatus.rows[0].ends_at).getTime() <= Date.now()
    ) {
      await finalizeReadyCheckAndAssignNextRound({ sessionId });
    }
  } catch {
    // Best-effort auto-finalization; continue returning current state.
  }

  const sessionResult = await pool.query<{
    id: number;
    event_id: number;
    session_index: number;
    starts_at: string | null;
    ends_at: string | null;
    status: 'scheduled' | 'live' | 'closed';
  }>(
    `
    SELECT id, event_id, session_index, starts_at, ends_at, status
    FROM event_sessions
    WHERE id = $1
    `,
    [sessionId],
  );

  if (sessionResult.rowCount === 0) {
    return null;
  }

  const roundsResult = await pool.query<{
    id: number;
    round_index: number;
    seed_payload: string | null;
    status: 'pending' | 'assigning' | 'playing' | 'scoring' | 'finalized';
  }>(
    `
    SELECT id, round_index, seed_payload, status
    FROM event_session_rounds
    WHERE session_id = $1
    ORDER BY round_index
    `,
    [sessionId],
  );

  const presenceResult = await pool.query<{
    user_id: number;
    display_name: string;
    role: 'playing' | 'spectating';
    state: 'online' | 'offline';
    last_seen_at: string | null;
  }>(
    `
    SELECT p.user_id, u.display_name, p.role, p.state, p.last_seen_at
    FROM event_session_presence p
    JOIN users u ON u.id = p.user_id
    WHERE p.session_id = $1
    ORDER BY u.display_name
    `,
    [sessionId],
  );

  const playersResult = await pool.query<{
    round_id: number;
    user_id: number;
    display_name: string;
    role: 'playing' | 'spectating';
    assigned_team_no: number | null;
  }>(
    `
    SELECT
      rp.round_id,
      rp.user_id,
      u.display_name,
      rp.role,
      rp.assigned_team_no
    FROM event_session_round_players rp
    JOIN users u ON u.id = rp.user_id
    JOIN event_session_rounds r ON r.id = rp.round_id
    WHERE r.session_id = $1
    ORDER BY r.round_index, rp.assigned_team_no NULLS LAST, u.display_name
    `,
    [sessionId],
  );

  const resultsResult = await pool.query<{
    round_id: number;
    team_no: number;
    score: number;
    submitted_at: string;
    submitted_by_user_id: number | null;
    replay_game_id: string | null;
  }>(
    `
    SELECT round_id, team_no, score, submitted_at, submitted_by_user_id, replay_game_id::text
    FROM event_session_round_team_results
    WHERE round_id IN (
      SELECT id FROM event_session_rounds WHERE session_id = $1
    )
    ORDER BY round_id, team_no
    `,
    [sessionId],
  );

  const readyCheckResult = await pool.query<{
    id: number;
    status: 'open' | 'closed';
    started_at: string;
    ends_at: string;
    initiated_by_user_id: number | null;
    closed_at: string | null;
  }>(
    `
    SELECT id, status, started_at, ends_at, initiated_by_user_id, closed_at
    FROM event_session_ready_checks
    WHERE session_id = $1
    `,
    [sessionId],
  );
  const readyCheck = readyCheckResult.rowCount > 0 ? readyCheckResult.rows[0] : null;

  const readyResponses = readyCheck
    ? (
        await pool.query<{
          user_id: number;
          is_ready: boolean;
          responded_at: string;
        }>(
          `
          SELECT user_id, is_ready, responded_at
          FROM event_session_ready_check_responses
          WHERE ready_check_id = $1
          `,
          [readyCheck.id],
        )
      ).rows
    : [];

  return {
    session: sessionResult.rows[0],
    rounds: roundsResult.rows,
    presence: presenceResult.rows,
    round_players: playersResult.rows,
    round_results: resultsResult.rows,
    ready_check: readyCheck,
    ready_responses: readyResponses,
  };
}

export async function listStandings(eventId: number): Promise<StandingsRow[]> {
  const result = await pool.query<StandingsRow>(
    `
    SELECT
      r.user_id,
      u.display_name,
      r.rating::float8 AS rating,
      r.games_played,
      r.sessions_played,
      r.last_played_at
    FROM event_player_ratings r
    JOIN users u ON u.id = r.user_id
    WHERE r.event_id = $1
    ORDER BY r.rating DESC, r.games_played DESC, u.display_name ASC
    `,
    [eventId],
  );
  return result.rows;
}

export async function listRatingHistory(eventId: number, limit = 300): Promise<HistoryRow[]> {
  const result = await pool.query<HistoryRow>(
    `
    SELECT
      l.id AS ledger_id,
      l.event_id,
      s.id AS session_id,
      s.session_index,
      r.id AS round_id,
      r.round_index,
      l.user_id,
      u.display_name,
      l.old_rating::float8 AS old_rating,
      l.delta_competitive::float8 AS delta_competitive,
      l.delta_participation::float8 AS delta_participation,
      l.new_rating::float8 AS new_rating,
      l.created_at
    FROM event_rating_ledger l
    JOIN event_session_rounds r ON r.id = l.round_id
    JOIN event_sessions s ON s.id = r.session_id
    JOIN users u ON u.id = l.user_id
    WHERE l.event_id = $1
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT $2
    `,
    [eventId, limit],
  );
  return result.rows;
}

export async function listSessionPlacementsForEvent(
  eventId: number,
): Promise<SessionPlacementRow[]> {
  const result = await pool.query<SessionPlacementRow>(
    `
    WITH round_team_scores AS (
      SELECT
        s.id AS session_id,
        s.session_index,
        r.id AS round_id,
        r.round_index,
        tr.team_no,
        tr.score,
        RANK() OVER (PARTITION BY r.id ORDER BY tr.score DESC) AS placement
      FROM event_sessions s
      JOIN event_session_rounds r ON r.session_id = s.id
      JOIN event_session_round_team_results tr ON tr.round_id = r.id
      WHERE s.event_id = $1
    )
    SELECT
      rts.session_id,
      rts.session_index,
      rts.round_id,
      rts.round_index,
      rp.user_id,
      u.display_name,
      rts.placement::int AS placement
    FROM round_team_scores rts
    JOIN event_session_round_players rp
      ON rp.round_id = rts.round_id
     AND rp.assigned_team_no = rts.team_no
     AND rp.role = 'playing'
    JOIN users u ON u.id = rp.user_id
    ORDER BY rts.session_index, rts.round_index, rts.placement, u.display_name
    `,
    [eventId],
  );
  return result.rows;
}

export async function listSessionEloForEvent(eventId: number): Promise<SessionEloRow[]> {
  const result = await pool.query<SessionEloRow>(
    `
    WITH ledger AS (
      SELECT
        s.id AS session_id,
        s.session_index,
        l.user_id,
        u.display_name,
        l.id AS ledger_id,
        r.round_index,
        l.old_rating::float8 AS old_rating,
        l.new_rating::float8 AS new_rating,
        (l.delta_competitive + l.delta_participation)::float8 AS delta_total,
        ROW_NUMBER() OVER (
          PARTITION BY s.id, l.user_id
          ORDER BY r.round_index ASC, l.id ASC
        ) AS rn_first,
        ROW_NUMBER() OVER (
          PARTITION BY s.id, l.user_id
          ORDER BY r.round_index DESC, l.id DESC
        ) AS rn_last
      FROM event_rating_ledger l
      JOIN event_session_rounds r ON r.id = l.round_id
      JOIN event_sessions s ON s.id = r.session_id
      JOIN users u ON u.id = l.user_id
      WHERE l.event_id = $1
    )
    SELECT
      session_id,
      session_index,
      user_id,
      display_name,
      MAX(CASE WHEN rn_first = 1 THEN old_rating END)::float8 AS starting_elo,
      MAX(CASE WHEN rn_last = 1 THEN new_rating END)::float8 AS final_elo,
      SUM(delta_total)::float8 AS elo_delta
    FROM ledger
    GROUP BY session_id, session_index, user_id, display_name
    ORDER BY session_index, final_elo DESC, display_name
    `,
    [eventId],
  );
  return result.rows;
}

export async function getSessionEventInfo(sessionId: number): Promise<{
  session_id: number;
  event_id: number;
  event_slug: string;
  event_status: 'DORMANT' | 'LIVE' | 'COMPLETE';
  owner_user_id: number | null;
  session_status: 'scheduled' | 'live' | 'closed';
} | null> {
  const result = await pool.query<{
    session_id: number;
    event_id: number;
    event_slug: string;
    event_status: 'DORMANT' | 'LIVE' | 'COMPLETE';
    owner_user_id: number | null;
    session_status: 'scheduled' | 'live' | 'closed';
  }>(
    `
    SELECT
      s.id AS session_id,
      s.event_id,
      e.slug AS event_slug,
      e.event_status,
      e.owner_user_id,
      s.status AS session_status
    FROM event_sessions s
    JOIN events e ON e.id = s.event_id
    WHERE s.id = $1
    `,
    [sessionId],
  );
  return result.rowCount > 0 ? result.rows[0] : null;
}

export async function setSessionStatus(
  sessionId: number,
  status: 'scheduled' | 'live' | 'closed',
): Promise<void> {
  await pool.query(`UPDATE event_sessions SET status = $2 WHERE id = $1`, [sessionId, status]);
}

export async function closeSessionOrDeleteIfEmpty(sessionId: number): Promise<{
  deleted: boolean;
}> {
  const client = await pool.connect();
  let finalizedRoundIds: number[] = [];
  try {
    await client.query('BEGIN');
    finalizedRoundIds = await finalizeActiveRoundsWithForfeitsTx(client, sessionId);

    const hasLoggedGamesRes = await client.query<{ has_logged: boolean }>(
      `
      SELECT EXISTS (
        SELECT 1
        FROM event_session_rounds r
        LEFT JOIN event_session_round_team_results tr ON tr.round_id = r.id
        LEFT JOIN event_rating_ledger l ON l.round_id = r.id
        WHERE r.session_id = $1
          AND (tr.id IS NOT NULL OR l.id IS NOT NULL)
      ) AS has_logged
      `,
      [sessionId],
    );

    const hasLoggedGames = Boolean(hasLoggedGamesRes.rows[0]?.has_logged);
    if (!hasLoggedGames) {
      await client.query(`DELETE FROM event_sessions WHERE id = $1`, [sessionId]);
      await client.query('COMMIT');
      for (const roundId of finalizedRoundIds) {
        try {
          await finalizeRoundElo(roundId);
        } catch (err) {
          const message = (err as Error).message;
          if (message !== 'NEED_AT_LEAST_ONE_TEAM' && message !== 'ROUND_NOT_FOUND') {
            console.error('Failed to finalize round ELO on session close-delete', { roundId, err });
          }
        }
      }
      return { deleted: true };
    }

    await client.query(`UPDATE event_sessions SET status = 'closed' WHERE id = $1`, [sessionId]);
    await client.query('COMMIT');
    for (const roundId of finalizedRoundIds) {
      try {
        await finalizeRoundElo(roundId);
      } catch (err) {
        const message = (err as Error).message;
        if (message !== 'NEED_AT_LEAST_ONE_TEAM' && message !== 'ROUND_NOT_FOUND') {
          console.error('Failed to finalize round ELO on session close', { roundId, err });
        }
      }
    }
    return { deleted: false };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closeEventAndComplete(eventId: number): Promise<void> {
  const client = await pool.connect();
  const finalizedRoundIds: number[] = [];
  try {
    await client.query('BEGIN');

    const sessionsRes = await client.query<{ id: number }>(
      `
      SELECT id
      FROM event_sessions
      WHERE event_id = $1
        AND status <> 'closed'
      ORDER BY session_index
      `,
      [eventId],
    );

    for (const s of sessionsRes.rows) {
      const ended = await finalizeActiveRoundsWithForfeitsTx(client, s.id);
      finalizedRoundIds.push(...ended);
      await client.query(
        `
        UPDATE event_sessions
        SET status = 'closed'
        WHERE id = $1
        `,
        [s.id],
      );
    }

    await client.query(
      `
      UPDATE events
      SET event_status = 'COMPLETE'
      WHERE id = $1
      `,
      [eventId],
    );

    await client.query('COMMIT');
    for (const roundId of finalizedRoundIds) {
      try {
        await finalizeRoundElo(roundId);
      } catch (err) {
        const message = (err as Error).message;
        if (message !== 'NEED_AT_LEAST_ONE_TEAM' && message !== 'ROUND_NOT_FOUND') {
          console.error('Failed to finalize round ELO on event close', { roundId, err });
        }
      }
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function reorderSessionRounds(input: {
  sessionId: number;
  roundIds: number[];
}): Promise<void> {
  const { sessionId, roundIds } = input;
  if (roundIds.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const pendingRes = await client.query<{ id: number }>(
      `
      SELECT id
      FROM event_session_rounds
      WHERE session_id = $1
        AND status = 'pending'
      ORDER BY round_index
      `,
      [sessionId],
    );

    if (pendingRes.rowCount === 0) {
      throw new Error('NO_PENDING_ROUNDS');
    }

    const fixedRes = await client.query<{ id: number }>(
      `
      SELECT id
      FROM event_session_rounds
      WHERE session_id = $1
        AND status <> 'pending'
      ORDER BY round_index
      `,
      [sessionId],
    );

    const pending = new Set(pendingRes.rows.map((r) => r.id));
    if (pending.size !== roundIds.length || roundIds.some((id) => !pending.has(id))) {
      throw new Error('ROUND_IDS_MISMATCH');
    }

    const maxIndexRes = await client.query<{ max_index: number | null }>(
      `SELECT MAX(round_index)::int AS max_index FROM event_session_rounds WHERE session_id = $1`,
      [sessionId],
    );
    const base = Number(maxIndexRes.rows[0]?.max_index ?? 0) + roundIds.length + 10;

    // Phase 1: move all targeted rounds out of the current index range to avoid UNIQUE conflicts.
    for (let i = 0; i < roundIds.length; i += 1) {
      await client.query(
        `UPDATE event_session_rounds SET round_index = $2 WHERE id = $1 AND session_id = $3`,
        [roundIds[i], base + i, sessionId],
      );
    }

    // Phase 2: keep non-pending rounds in order first, then apply requested pending order.
    let nextIndex = 1;
    for (const row of fixedRes.rows) {
      await client.query(
        `UPDATE event_session_rounds SET round_index = $2 WHERE id = $1 AND session_id = $3`,
        [row.id, nextIndex, sessionId],
      );
      nextIndex += 1;
    }
    for (const roundId of roundIds) {
      await client.query(
        `UPDATE event_session_rounds SET round_index = $2 WHERE id = $1 AND session_id = $3`,
        [roundId, nextIndex, sessionId],
      );
      nextIndex += 1;
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function listDelegatesWithOwner(eventId: number): Promise<{
  owner_user_id: number | null;
  delegates: Array<{ user_id: number; display_name: string; role: string }>;
}> {
  const ownerResult = await pool.query<{ owner_user_id: number | null }>(
    `SELECT owner_user_id FROM events WHERE id = $1`,
    [eventId],
  );
  const delegates = await listEventDelegates(eventId);
  return {
    owner_user_id: ownerResult.rowCount > 0 ? ownerResult.rows[0].owner_user_id : null,
    delegates,
  };
}

export async function getCurrentRoundForSession(sessionId: number): Promise<{
  id: number;
  round_index: number;
  seed_payload: string | null;
  status: 'pending' | 'assigning' | 'playing' | 'scoring' | 'finalized';
} | null> {
  const result = await pool.query<{
    id: number;
    round_index: number;
    seed_payload: string | null;
    status: 'pending' | 'assigning' | 'playing' | 'scoring' | 'finalized';
  }>(
    `
    SELECT id, round_index, seed_payload, status
    FROM event_session_rounds
    WHERE session_id = $1
    ORDER BY
      CASE status
        WHEN 'playing' THEN 1
        WHEN 'scoring' THEN 2
        WHEN 'assigning' THEN 3
        WHEN 'pending' THEN 4
        ELSE 5
      END,
      round_index
    LIMIT 1
    `,
    [sessionId],
  );
  return result.rowCount > 0 ? result.rows[0] : null;
}

export async function assignNextRound(input: {
  sessionId: number;
  seedPayload?: string | null;
  overrideMissingScores?: boolean;
  overrideReason?: string | null;
}) {
  const { sessionId, seedPayload = null, overrideMissingScores = false } = input;

  const client = await pool.connect();
  const finalizedRoundIds: number[] = [];
  try {
    await client.query('BEGIN');

    const activeRoundRes = await client.query<{
      id: number;
      round_index: number;
      status: 'pending' | 'assigning' | 'playing' | 'scoring' | 'finalized';
    }>(
      `
      SELECT id, round_index, status
      FROM event_session_rounds
      WHERE session_id = $1
        AND status IN ('assigning', 'playing', 'scoring')
      ORDER BY round_index
      `,
      [sessionId],
    );

    if (activeRoundRes.rowCount > 0) {
      for (const r of activeRoundRes.rows) {
        const teamCountRes = await client.query<{ count: string }>(
          `
          SELECT COUNT(DISTINCT assigned_team_no)::int AS count
          FROM event_session_round_players
          WHERE round_id = $1 AND role = 'playing' AND assigned_team_no IS NOT NULL
          `,
          [r.id],
        );
        const submittedRes = await client.query<{ count: string }>(
          `
          SELECT COUNT(*)::int AS count
          FROM event_session_round_team_results
          WHERE round_id = $1
          `,
          [r.id],
        );
        const teamCount = Number(teamCountRes.rows[0]?.count ?? 0);
        const submitted = Number(submittedRes.rows[0]?.count ?? 0);
        const missing = Math.max(0, teamCount - submitted);
        if (missing > 0 && !overrideMissingScores) {
          await client.query('ROLLBACK');
          return {
            blocked: true as const,
            reason: 'MISSING_SCORES',
            missing_teams: missing,
            round_id: r.id,
            round_index: r.round_index,
          };
        }
        if (missing > 0 && overrideMissingScores) {
          await client.query(
            `
            INSERT INTO event_session_round_team_results (
              round_id,
              team_no,
              score,
              submitted_by_user_id,
              submitted_at
            )
            SELECT
              $1,
              t.team_no,
              0,
              NULL,
              NOW()
            FROM (
              SELECT DISTINCT assigned_team_no AS team_no
              FROM event_session_round_players
              WHERE round_id = $1
                AND role = 'playing'
                AND assigned_team_no IS NOT NULL
            ) t
            LEFT JOIN event_session_round_team_results existing
              ON existing.round_id = $1
             AND existing.team_no = t.team_no
            WHERE existing.id IS NULL
            `,
            [r.id],
          );
        }
        await client.query(
          `
          UPDATE event_session_rounds
          SET status = 'finalized'
          WHERE id = $1
          `,
          [r.id],
        );
        finalizedRoundIds.push(r.id);
      }
    }

    const nextRoundRes = await client.query<{
      id: number;
      round_index: number;
      seed_payload: string | null;
      status: 'pending' | 'assigning' | 'playing' | 'scoring' | 'finalized';
    }>(
      `
      SELECT id, round_index, seed_payload, status
      FROM event_session_rounds
      WHERE session_id = $1
        AND status = 'pending'
      ORDER BY round_index
      LIMIT 1
      `,
      [sessionId],
    );
    if (nextRoundRes.rowCount === 0) {
      await client.query('ROLLBACK');
      return { blocked: true as const, reason: 'NO_PENDING_ROUNDS' };
    }

    const round = nextRoundRes.rows[0];
    const effectiveSeed = seedPayload ?? round.seed_payload;
    if (!effectiveSeed) {
      await client.query('ROLLBACK');
      return { blocked: true as const, reason: 'SEED_REQUIRED', round_id: round.id };
    }

    await client.query(
      `UPDATE event_session_rounds SET status = 'assigning', seed_payload = $2 WHERE id = $1`,
      [round.id, effectiveSeed],
    );

    const presenceRows = await client.query<{
      user_id: number;
      role: 'playing' | 'spectating';
      state: 'online' | 'offline';
    }>(
      `
      SELECT user_id, role, state
      FROM event_session_presence
      WHERE session_id = $1
        AND state = 'online'
      `,
      [sessionId],
    );

    const playing = presenceRows.rows.filter((r) => r.role === 'playing').map((r) => r.user_id);
    const spectators = presenceRows.rows
      .filter((r) => r.role === 'spectating')
      .map((r) => r.user_id);
    const shuffled = shuffleInPlace(
      [...playing],
      `${sessionId}:${round.round_index}:${effectiveSeed}`,
    );
    const teamSizes = partitionHybrid34(shuffled.length);

    let cursor = 0;
    let teamNo = 1;
    for (const sz of teamSizes) {
      for (let i = 0; i < sz; i += 1) {
        const userId = shuffled[cursor];
        cursor += 1;
        await client.query(
          `
          INSERT INTO event_session_round_players (round_id, user_id, role, assigned_team_no)
          VALUES ($1, $2, 'playing', $3)
          ON CONFLICT (round_id, user_id)
          DO UPDATE SET role = 'playing', assigned_team_no = EXCLUDED.assigned_team_no
          `,
          [round.id, userId, teamNo],
        );
      }
      teamNo += 1;
    }

    for (let i = cursor; i < shuffled.length; i += 1) {
      await client.query(
        `
        INSERT INTO event_session_round_players (round_id, user_id, role, assigned_team_no)
        VALUES ($1, $2, 'playing', NULL)
        ON CONFLICT (round_id, user_id)
        DO UPDATE SET role = 'playing', assigned_team_no = NULL
        `,
        [round.id, shuffled[i]],
      );
    }

    for (const userId of spectators) {
      await client.query(
        `
        INSERT INTO event_session_round_players (round_id, user_id, role, assigned_team_no)
        VALUES ($1, $2, 'spectating', NULL)
        ON CONFLICT (round_id, user_id)
        DO UPDATE SET role = 'spectating', assigned_team_no = NULL
        `,
        [round.id, userId],
      );
    }

    await client.query(`UPDATE event_session_rounds SET status = 'playing' WHERE id = $1`, [
      round.id,
    ]);
    await client.query('COMMIT');

    for (const roundId of finalizedRoundIds) {
      try {
        await finalizeRoundElo(roundId);
      } catch (err) {
        const message = (err as Error).message;
        if (message !== 'NEED_AT_LEAST_ONE_TEAM' && message !== 'ROUND_NOT_FOUND') {
          console.error('Failed to finalize round ELO on assignNextRound', { roundId, err });
        }
      }
    }

    return {
      blocked: false as const,
      round_id: round.id,
      round_index: round.round_index,
      seed_payload: effectiveSeed,
      teams_assigned: teamSizes.length,
      players_assigned: teamSizes.reduce((a, b) => a + b, 0),
      players_benched: Math.max(0, shuffled.length - teamSizes.reduce((a, b) => a + b, 0)),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function submitRoundScore(input: {
  roundId: number;
  teamNo: number;
  score: number;
  submittedByUserId: number;
  replayGameId?: number | null;
}) {
  await ensureRoundResultReplayColumn();
  const { roundId, teamNo, score, submittedByUserId, replayGameId = null } = input;
  const result = await pool.query(
    `
    INSERT INTO event_session_round_team_results (
      round_id,
      team_no,
      score,
      submitted_by_user_id,
      submitted_at,
      replay_game_id
    )
    VALUES ($1, $2, $3, $4, NOW(), $5)
    ON CONFLICT (round_id, team_no)
    DO UPDATE SET
      score = EXCLUDED.score,
      submitted_by_user_id = EXCLUDED.submitted_by_user_id,
      submitted_at = NOW(),
      replay_game_id = EXCLUDED.replay_game_id
    RETURNING id, round_id, team_no, score, submitted_by_user_id, submitted_at, replay_game_id::text
    `,
    [roundId, teamNo, score, submittedByUserId, replayGameId],
  );

  await pool.query(
    `
    UPDATE event_session_rounds
    SET status = 'scoring'
    WHERE id = $1 AND status = 'playing'
    `,
    [roundId],
  );

  const counts = await pool.query<{ team_count: string; submitted_count: string }>(
    `
    SELECT
      (
        SELECT COUNT(DISTINCT assigned_team_no)::int
        FROM event_session_round_players
        WHERE round_id = $1
          AND role = 'playing'
          AND assigned_team_no IS NOT NULL
      )::text AS team_count,
      (
        SELECT COUNT(*)::int
        FROM event_session_round_team_results
        WHERE round_id = $1
      )::text AS submitted_count
    `,
    [roundId],
  );
  const teamCount = Number(counts.rows[0]?.team_count ?? 0);
  const submittedCount = Number(counts.rows[0]?.submitted_count ?? 0);
  if (teamCount > 0 && submittedCount >= teamCount) {
    await pool.query(
      `
      UPDATE event_session_rounds
      SET status = 'finalized'
      WHERE id = $1
      `,
      [roundId],
    );
    try {
      await finalizeRoundElo(roundId);
    } catch (err) {
      const message = (err as Error).message;
      if (message !== 'NEED_AT_LEAST_ONE_TEAM' && message !== 'ROUND_NOT_FOUND') {
        console.error('Failed to finalize round ELO on score submit', { roundId, err });
      }
    }
  }

  return result.rows[0];
}

export async function canSubmitTeamScore(input: {
  roundId: number;
  userId: number;
  teamNo: number;
}): Promise<boolean> {
  const result = await pool.query(
    `
    SELECT 1
    FROM event_session_round_players
    WHERE round_id = $1
      AND user_id = $2
      AND assigned_team_no = $3
      AND role = 'playing'
    `,
    [input.roundId, input.userId, input.teamNo],
  );
  return result.rowCount > 0;
}

export async function getRoundTeamReplayValidationContext(input: {
  roundId: number;
  teamNo: number;
}): Promise<{ seed_payload: string | null; team_players: string[] } | null> {
  const roundRes = await pool.query<{ seed_payload: string | null }>(
    `
    SELECT seed_payload
    FROM event_session_rounds
    WHERE id = $1
    `,
    [input.roundId],
  );
  if (roundRes.rowCount === 0) return null;

  const playersRes = await pool.query<{ display_name: string }>(
    `
    SELECT u.display_name
    FROM event_session_round_players rp
    JOIN users u ON u.id = rp.user_id
    WHERE rp.round_id = $1
      AND rp.role = 'playing'
      AND rp.assigned_team_no = $2
    ORDER BY u.display_name
    `,
    [input.roundId, input.teamNo],
  );

  return {
    seed_payload: roundRes.rows[0].seed_payload,
    team_players: playersRes.rows.map((row) => row.display_name),
  };
}

export async function finalizeRoundElo(roundId: number): Promise<{
  event_id: number;
  round_id: number;
  team_count: number;
  ledger_rows: number;
}> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const metaRes = await client.query<{
      event_id: number;
      session_id: number;
      status: string;
      k_factor: number | null;
      participation_bonus: number | null;
    }>(
      `
      SELECT
        s.event_id,
        r.session_id,
        r.status,
        c.k_factor,
        c.participation_bonus::float8 AS participation_bonus
      FROM event_session_rounds r
      JOIN event_sessions s ON s.id = r.session_id
      LEFT JOIN event_session_ladder_config c ON c.event_id = s.event_id
      WHERE r.id = $1
      `,
      [roundId],
    );
    if (metaRes.rowCount === 0) {
      throw new Error('ROUND_NOT_FOUND');
    }
    const meta = metaRes.rows[0];
    const eventId = meta.event_id;
    const k = Number(meta.k_factor ?? 24);
    const bonus = Number(meta.participation_bonus ?? 0.5);

    const existingLedgerRes = await client.query<{ count: string }>(
      `
      SELECT COUNT(*)::int AS count
      FROM event_rating_ledger
      WHERE round_id = $1
      `,
      [roundId],
    );
    const existingLedgerCount = Number(existingLedgerRes.rows[0]?.count ?? 0);
    if (existingLedgerCount > 0) {
      const existingTeamsRes = await client.query<{ count: string }>(
        `
        SELECT COUNT(*)::int AS count
        FROM event_session_round_team_results
        WHERE round_id = $1
        `,
        [roundId],
      );
      await client.query('COMMIT');
      return {
        event_id: eventId,
        round_id: roundId,
        team_count: Number(existingTeamsRes.rows[0]?.count ?? 0),
        ledger_rows: existingLedgerCount,
      };
    }

    const teamsRes = await client.query<{
      team_no: number;
      score: number;
    }>(
      `
      SELECT team_no, score
      FROM event_session_round_team_results
      WHERE round_id = $1
      ORDER BY team_no
      `,
      [roundId],
    );
    if (teamsRes.rowCount < 1) {
      throw new Error('NEED_AT_LEAST_ONE_TEAM');
    }

    const teamPlayersRes = await client.query<{
      team_no: number;
      user_id: number;
    }>(
      `
      SELECT assigned_team_no AS team_no, user_id
      FROM event_session_round_players
      WHERE round_id = $1
        AND role = 'playing'
        AND assigned_team_no IS NOT NULL
      ORDER BY assigned_team_no, user_id
      `,
      [roundId],
    );

    const teamMap = new Map<number, number[]>();
    for (const row of teamPlayersRes.rows) {
      if (!teamMap.has(row.team_no)) teamMap.set(row.team_no, []);
      teamMap.get(row.team_no)!.push(row.user_id);
    }

    const uniquePlayers = [...new Set(teamPlayersRes.rows.map((r) => r.user_id))];
    for (const userId of uniquePlayers) {
      await client.query(
        `
        INSERT INTO event_player_ratings (event_id, user_id, rating, games_played, sessions_played, last_played_at)
        VALUES ($1, $2, 1000, 0, 0, NULL)
        ON CONFLICT (event_id, user_id) DO NOTHING
        `,
        [eventId, userId],
      );
    }

    const ratingsRes = await client.query<{
      user_id: number;
      rating: number;
      games_played: number;
      sessions_played: number;
    }>(
      `
      SELECT user_id, rating::float8 AS rating, games_played, sessions_played
      FROM event_player_ratings
      WHERE event_id = $1
        AND user_id = ANY($2::int[])
      `,
      [eventId, uniquePlayers],
    );
    const playerRating = new Map<number, number>();
    ratingsRes.rows.forEach((r) => playerRating.set(r.user_id, Number(r.rating)));

    const teamRows = teamsRes.rows.map((t) => {
      const players = teamMap.get(t.team_no) ?? [];
      const avg =
        players.length > 0
          ? players.reduce((sum, id) => sum + (playerRating.get(id) ?? 1000), 0) / players.length
          : 1000;
      return { ...t, players, avg_rating: avg };
    });

    const teamDelta = new Map<number, number>();
    for (const a of teamRows) {
      let sum = 0;
      let pairs = 0;
      for (const b of teamRows) {
        if (a.team_no === b.team_no) continue;
        const expected = 1 / (1 + 10 ** ((b.avg_rating - a.avg_rating) / 400));
        const actual = a.score > b.score ? 1 : a.score < b.score ? 0 : 0.5;
        sum += actual - expected;
        pairs += 1;
      }
      teamDelta.set(a.team_no, pairs > 0 ? (k * sum) / pairs : 0);
    }

    let ledgerRows = 0;
    for (const team of teamRows) {
      const tDelta = teamDelta.get(team.team_no) ?? 0;
      const perPlayerCompetitive = team.players.length > 0 ? tDelta / team.players.length : 0;
      for (const userId of team.players) {
        const oldRating = playerRating.get(userId) ?? 1000;
        const newRating = oldRating + perPlayerCompetitive + bonus;
        await client.query(
          `
          INSERT INTO event_rating_ledger (
            event_id,
            round_id,
            user_id,
            old_rating,
            delta_competitive,
            delta_participation,
            new_rating,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          `,
          [eventId, roundId, userId, oldRating, perPlayerCompetitive, bonus, newRating],
        );
        ledgerRows += 1;

        await client.query(
          `
          UPDATE event_player_ratings
          SET
            rating = $3,
            games_played = games_played + 1,
            sessions_played = sessions_played + 1,
            last_played_at = NOW(),
            updated_at = NOW()
          WHERE event_id = $1 AND user_id = $2
          `,
          [eventId, userId, newRating],
        );
      }
    }

    await client.query(`UPDATE event_session_rounds SET status = 'finalized' WHERE id = $1`, [
      roundId,
    ]);
    await client.query('COMMIT');

    return {
      event_id: eventId,
      round_id: roundId,
      team_count: teamRows.length,
      ledger_rows: ledgerRows,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getRoundEventId(roundId: number): Promise<number | null> {
  const result = await pool.query<{ event_id: number }>(
    `
    SELECT s.event_id
    FROM event_session_rounds r
    JOIN event_sessions s ON s.id = r.session_id
    WHERE r.id = $1
    `,
    [roundId],
  );
  return result.rowCount > 0 ? result.rows[0].event_id : null;
}
