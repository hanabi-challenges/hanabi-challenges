// src/modules/results/result.service.ts
import type { PoolClient } from 'pg';
import { pool } from '../../config/db';

export type ZeroReason = 'Strike Out' | 'Time Out' | 'VTK' | null;

export interface GameResultRow {
  id: number;
  event_team_id: number;
  event_game_template_id: number;
  game_id: number | null; // hanab.live id
  score: number;
  zero_reason: ZeroReason;
  bottom_deck_risk: number | null;
  notes: string | null;
  played_at: string;
  created_at: string;
}

export interface GameResultDetail extends GameResultRow {
  event_id: number;
  event_stage_id: number;
  stage_index: number;
  stage_label: string;
  stage_type: 'SINGLE' | 'ROUND_ROBIN' | 'BRACKET' | 'GAUNTLET';
  template_index: number;
  event_team_name: string;
  player_count: number;
  players: string[]; // display names in seat order
}

/**
 * Create a game result: insert into games with result fields.
 * Assumes event_team_id and event_game_template_id are valid and
 * uniqueness (event_team_id, event_game_template_id) is enforced by the DB.
 */
export async function createGameResult(input: {
  event_team_id: number;
  event_game_template_id: number;
  game_id?: number | null; // hanab.live
  score: number;
  zero_reason?: ZeroReason;
  bottom_deck_risk?: number | null;
  notes?: string | null;
  played_at?: string | null;
  players?: string[];
}): Promise<GameResultRow> {
  const {
    event_team_id,
    event_game_template_id,
    game_id = null,
    score,
    zero_reason = null,
    bottom_deck_risk = null,
    notes = null,
    played_at = null,
    players = [],
  } = input;

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `
      INSERT INTO event_games (
        event_team_id,
        event_game_template_id,
        game_id,
        score,
        zero_reason,
        bottom_deck_risk,
        notes,
        played_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW()))
      RETURNING
        id,
        event_team_id,
        event_game_template_id,
        game_id,
        score,
        zero_reason,
        bottom_deck_risk,
        notes,
        played_at,
        created_at;
      `,
        [
          event_team_id,
          event_game_template_id,
          game_id,
          score,
          zero_reason,
          bottom_deck_risk,
          notes,
          played_at,
        ],
      );

      const gameRow = result.rows[0] as GameResultRow;

      if (players.length > 0) {
        const userRows = await client.query(
          `SELECT id, display_name FROM users WHERE display_name = ANY($1::text[])`,
          [players],
        );
        const idMap = new Map<string, number>();
        userRows.rows.forEach((r) => idMap.set(r.display_name, r.id));

        const missing = players.filter((name) => !idMap.has(name));
        if (missing.length > 0) {
          console.warn('game_participants: skipping unknown users', {
            gameId: gameRow.id,
            names: missing,
          });
        }

        const inserts = players
          .map((name) => {
            const userId = idMap.get(name);
            if (!userId) return null;
            return client.query(
              `
              INSERT INTO game_participants (event_game_id, user_id)
              VALUES ($1, $2)
              ON CONFLICT DO NOTHING;
              `,
              [gameRow.id, userId],
            );
          })
          .filter((query): query is NonNullable<typeof query> => query != null);

        if (inserts.length > 0) {
          console.log('game_participants: inserting seats', {
            gameId: gameRow.id,
            count: inserts.length,
          });
          await Promise.all(inserts);
        }
      }

      await client.query('COMMIT');
      await updateStageStatus(client, {
        event_team_id,
        event_game_template_id,
      });
      return gameRow;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      const e = new Error('A game result already exists for this team and template');
      (e as { code?: string }).code = 'GAME_RESULT_EXISTS';
      throw e;
    }

    throw err;
  }
}

async function updateStageStatus(
  client: PoolClient,
  input: { event_team_id: number; event_game_template_id: number },
) {
  const { event_team_id, event_game_template_id } = input;

  // Fetch stage info and max scores
  const stageInfo = await client.query(
    `
    SELECT
      egt.event_stage_id,
      es.stage_index,
      es.stage_type,
      es.label,
      egt.max_score
    FROM event_game_templates egt
    JOIN event_stages es ON es.event_stage_id = egt.event_stage_id
    WHERE egt.id = $1
    `,
    [event_game_template_id],
  );
  if (stageInfo.rowCount === 0) return;
  const stageId = stageInfo.rows[0].event_stage_id as number;

  const totalTemplatesResult = await client.query<{ count: string; total_max: string | null }>(
    `
    SELECT COUNT(*)::int AS count, COALESCE(SUM(max_score),0) AS total_max
    FROM event_game_templates
    WHERE event_stage_id = $1
    `,
    [stageId],
  );
  const totalTemplates = Number(totalTemplatesResult.rows[0].count) || 0;
  const totalMaxScore = Number(totalTemplatesResult.rows[0].total_max) || 0;

  const statsResult = await client.query<{
    played: string;
    total_score: string | null;
    avg_score: string | null;
    avg_bdr: string | null;
  }>(
    `
    SELECT
      COUNT(*)::int AS played,
      COALESCE(SUM(g.score), 0) AS total_score,
      AVG(g.score) AS avg_score,
      AVG(g.bottom_deck_risk) AS avg_bdr
    FROM event_games g
    JOIN event_game_templates egt ON egt.id = g.event_game_template_id
    WHERE g.event_team_id = $1
      AND egt.event_stage_id = $2
    `,
    [event_team_id, stageId],
  );

  const playedCount = Number(statsResult.rows[0].played) || 0;
  const totalScore = Number(statsResult.rows[0].total_score) || 0;
  const avgScore = statsResult.rows[0].avg_score ? Number(statsResult.rows[0].avg_score) : null;
  const avgBdr = statsResult.rows[0].avg_bdr ? Number(statsResult.rows[0].avg_bdr) : null;
  const percentMax = totalMaxScore > 0 ? totalScore / totalMaxScore : null;
  const status = totalTemplates > 0 && playedCount >= totalTemplates ? 'complete' : 'in_progress';
  const completed_at = status === 'complete' ? new Date().toISOString() : null;

  await client.query(
    `
    INSERT INTO event_stage_team_statuses (event_stage_id, event_team_id, status, completed_at, metadata_json)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (event_stage_id, event_team_id)
    DO UPDATE SET
      status = EXCLUDED.status,
      completed_at = EXCLUDED.completed_at,
      metadata_json = EXCLUDED.metadata_json
    `,
    [
      stageId,
      event_team_id,
      status,
      completed_at,
      {
        percent_max_score: percentMax,
        average_score: avgScore,
        average_bdr: avgBdr,
        games_played: playedCount,
        total_templates: totalTemplates,
        total_score: totalScore,
        total_max_score: totalMaxScore,
      },
    ],
  );
}

/**
 * Get a fully-hydrated result by games.id
 * (includes template, team, players, etc.)
 */
export async function getGameResultById(id: number): Promise<GameResultDetail | null> {
  const result = await pool.query(
    `
    SELECT
      g.id,
      g.event_team_id,
      g.event_game_template_id,
      g.game_id,
      g.score,
      g.zero_reason,
      g.bottom_deck_risk,
      g.notes,
      g.played_at,
      g.created_at,
      es.event_id,
      es.event_stage_id,
      es.stage_index,
      es.label AS stage_label,
      es.stage_type,
      egt.template_index,
      t.name AS event_team_name,
      t.team_size AS player_count,
      array_remove(array_agg(u.display_name ORDER BY u.display_name), NULL) AS players
    FROM event_games g
    JOIN event_game_templates egt ON egt.id = g.event_game_template_id
    JOIN event_stages es ON es.event_stage_id = egt.event_stage_id
    JOIN event_teams t ON t.id = g.event_team_id
    LEFT JOIN game_participants gp ON gp.event_game_id = g.id
    LEFT JOIN users u ON u.id = gp.user_id
    WHERE g.id = $1
    GROUP BY
      g.id,
      g.event_team_id,
      g.event_game_template_id,
      g.game_id,
      g.score,
      g.zero_reason,
      g.bottom_deck_risk,
      g.notes,
      g.played_at,
      g.created_at,
      es.event_id,
      es.event_stage_id,
      es.stage_index,
      es.label,
      es.stage_type,
      egt.template_index,
      t.name,
      t.team_size;
    `,
    [id],
  );

  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0] as {
    players: unknown;
  } & Omit<GameResultDetail, 'players'>;

  // row.players may be a Postgres array parsed as JS array,
  // or a raw string like "{bob,carol,dave}" depending on pg settings.
  let players: string[];

  if (Array.isArray(row.players)) {
    players = row.players;
  } else if (typeof row.players === 'string') {
    players = row.players
      .replace(/^\{|\}$/g, '') // drop { }
      .split(',')
      .filter((p: string) => p.length > 0);
  } else {
    players = [];
  }

  return {
    ...row,
    players,
  } as GameResultDetail;
}
