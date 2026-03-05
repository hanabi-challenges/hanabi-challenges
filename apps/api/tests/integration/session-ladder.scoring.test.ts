import { beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../src/config/db';
import {
  finalizeRoundElo,
  submitRoundScore,
} from '../../src/modules/session-ladder/session-ladder.service';

type RoundSeed = {
  roundId: number;
  eventId: number;
};

async function seedRoundForFinalize(input: {
  teamOneScore: number;
  teamTwoScore: number;
  teamOneEndCondition?: number | null;
  teamTwoEndCondition?: number | null;
  teamOneBdr?: number | null;
  teamTwoBdr?: number | null;
}): Promise<RoundSeed> {
  const {
    teamOneScore,
    teamTwoScore,
    teamOneEndCondition = 1,
    teamTwoEndCondition = 1,
    teamOneBdr = null,
    teamTwoBdr = null,
  } = input;

  const eventRes = await pool.query<{ id: number }>(
    `
    INSERT INTO events (name, slug, short_description, long_description, event_format)
    VALUES ('League Scoring Test', md5(random()::text), 'short', 'long', 'session_ladder')
    RETURNING id
    `,
  );
  const eventId = eventRes.rows[0].id;

  await pool.query(
    `
    INSERT INTO event_session_ladder_config (event_id, k_factor, participation_bonus)
    VALUES ($1, 24, 0)
    `,
    [eventId],
  );

  const sessionRes = await pool.query<{ id: number }>(
    `
    INSERT INTO event_sessions (event_id, session_index, status)
    VALUES ($1, 1, 'live')
    RETURNING id
    `,
    [eventId],
  );
  const sessionId = sessionRes.rows[0].id;

  const roundRes = await pool.query<{ id: number }>(
    `
    INSERT INTO event_session_rounds (session_id, round_index, status, seed_payload)
    VALUES ($1, 1, 'scoring', '{"variant":"No Variant","seed":"abc123"}')
    RETURNING id
    `,
    [sessionId],
  );
  const roundId = roundRes.rows[0].id;

  const usersRes = await pool.query<{ id: number }>(
    `
    INSERT INTO users (display_name, password_hash, role)
    VALUES
      (md5(random()::text), 'x', 'USER'),
      (md5(random()::text), 'x', 'USER'),
      (md5(random()::text), 'x', 'USER'),
      (md5(random()::text), 'x', 'USER')
    RETURNING id
    `,
  );
  const [u1, u2, u3, u4] = usersRes.rows.map((row) => row.id);

  await pool.query(
    `
    INSERT INTO event_session_round_players (round_id, user_id, role, assigned_team_no)
    VALUES
      ($1, $2, 'playing', 1),
      ($1, $3, 'playing', 1),
      ($1, $4, 'playing', 2),
      ($1, $5, 'playing', 2)
    `,
    [roundId, u1, u2, u3, u4],
  );

  await submitRoundScore({
    roundId,
    teamNo: 1,
    score: teamOneScore,
    submittedByUserId: u1,
    endCondition: teamOneEndCondition,
    bottomDeckRisk: teamOneBdr,
  });
  await submitRoundScore({
    roundId,
    teamNo: 2,
    score: teamTwoScore,
    submittedByUserId: u3,
    endCondition: teamTwoEndCondition,
    bottomDeckRisk: teamTwoBdr,
  });

  return { roundId, eventId };
}

describe('session-ladder scoring finalize (integration)', () => {
  beforeEach(async () => {
    await pool.query(
      `
      TRUNCATE
        event_rating_ledger,
        event_player_ratings,
        event_session_round_team_results,
        event_session_round_players,
        event_session_rounds,
        event_sessions,
        event_session_ladder_config,
        team_memberships,
        event_teams,
        event_stages,
        event_game_templates,
        events,
        users
      RESTART IDENTITY CASCADE
      `,
    );
  });

  it('returns team metadata with k/victory_type and is idempotent', async () => {
    const { roundId } = await seedRoundForFinalize({
      teamOneScore: 25,
      teamTwoScore: 20,
      teamOneEndCondition: 3,
      teamTwoEndCondition: 1,
    });

    const first = await finalizeRoundElo(roundId);
    expect(first.ledger_rows).toBe(4);
    expect(first.team_meta).toHaveLength(2);
    expect(first.team_meta.map((row) => row.team_no).sort((a, b) => a - b)).toEqual([1, 2]);
    expect(first.team_meta.find((row) => row.team_no === 1)?.victory_type).toBe('turns');

    const countAfterFirst = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM event_rating_ledger WHERE round_id = $1`,
      [roundId],
    );
    expect(Number(countAfterFirst.rows[0].count)).toBe(4);

    const second = await finalizeRoundElo(roundId);
    const countAfterSecond = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM event_rating_ledger WHERE round_id = $1`,
      [roundId],
    );
    expect(second.ledger_rows).toBe(4);
    expect(Number(countAfterSecond.rows[0].count)).toBe(4);
  });

  it('serializes concurrent finalize attempts for the same round', async () => {
    const { roundId } = await seedRoundForFinalize({
      teamOneScore: 21,
      teamTwoScore: 20,
      teamOneEndCondition: 1,
      teamTwoEndCondition: 1,
    });

    const [a, b] = await Promise.all([finalizeRoundElo(roundId), finalizeRoundElo(roundId)]);
    expect(a.ledger_rows).toBe(4);
    expect(b.ledger_rows).toBe(4);

    const ledgerCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM event_rating_ledger WHERE round_id = $1`,
      [roundId],
    );
    expect(Number(ledgerCount.rows[0].count)).toBe(4);
  });
});
