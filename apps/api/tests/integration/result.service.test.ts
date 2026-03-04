import { describe, it, expect, beforeEach } from 'vitest';
import { pool } from '../../src/config/db';
import {
  createGameResult,
  getGameResultById,
  ZeroReason,
} from '../../src/modules/results/result.service';

interface GameResultErrorShape {
  code: string;
}

describe('result.service (games, integration)', () => {
  beforeEach(async () => {
    await pool.query(
      `
      TRUNCATE
        event_stage_team_statuses,
        game_participants,
        event_games,
        event_game_templates,
        team_memberships,
        event_teams,
        event_stages,
        events,
        users
      RESTART IDENTITY CASCADE;
      `,
    );
  });

  async function setupEventTemplateTeamAndUsers() {
    // Event
    const eventRes = await pool.query(
      `
      INSERT INTO events (name, slug, short_description, long_description)
      VALUES ($1, $2, $3, $4)
      RETURNING id;
      `,
      ['Result Test Event', 'result-test-event', 'short desc', 'long description for result tests'],
    );
    const eventId = eventRes.rows[0].id as number;

    // Stage
    const stageRes = await pool.query(
      `
      INSERT INTO event_stages (event_id, stage_index, label, stage_type)
      VALUES ($1, 1, 'Stage 1', 'SINGLE')
      RETURNING event_stage_id, stage_index;
      `,
      [eventId],
    );
    const eventStageId = stageRes.rows[0].event_stage_id as number;
    const stageIndex = stageRes.rows[0].stage_index as number;

    // Template
    const templateRes = await pool.query(
      `
      INSERT INTO event_game_templates (event_stage_id, template_index, variant, seed_payload)
      VALUES ($1, $2, $3, $4)
      RETURNING id, template_index;
      `,
      [eventStageId, 1, 'NO_VARIANT', 'RESULT-TEST-TEMPLATE-1'],
    );
    const templateId = templateRes.rows[0].id as number;
    const templateIndex = templateRes.rows[0].template_index as number;

    // Team (3-player team for this test)
    const teamRes = await pool.query(
      `
      INSERT INTO event_teams (name, event_id, team_size)
      VALUES ($1, $2, 3)
      RETURNING id, name, team_size;
      `,
      ['Lanterns', eventId],
    );
    const eventTeamId = teamRes.rows[0].id as number;
    const eventTeamName = teamRes.rows[0].name as string;
    const teamSize = teamRes.rows[0].team_size as number;

    // Users / players
    const playersRes = await pool.query(
      `
      INSERT INTO users (display_name, password_hash, role)
      VALUES
        ('bob',   'dummy-hash', 'USER'),
        ('carol', 'dummy-hash', 'USER'),
        ('dave',  'dummy-hash', 'USER')
      RETURNING id, display_name;
      `,
    );
    const playerIds = playersRes.rows.map((r) => r.id as number);
    const playerNames = playersRes.rows.map((r) => r.display_name as string);

    // In the new schema, player_count comes from event_teams.team_size.
    const playerCount = teamSize;

    return {
      eventId,
      eventStageId,
      stageIndex,
      templateId,
      templateIndex,
      eventTeamId,
      eventTeamName,
      playerIds,
      playerNames,
      playerCount,
      teamSize,
    };
  }

  it('getGameResultById returns hydrated result for an existing game', async () => {
    const {
      eventId,
      eventStageId,
      stageIndex,
      templateId,
      templateIndex,
      eventTeamId,
      eventTeamName,
      playerIds,
      playerNames,
      playerCount,
    } = await setupEventTemplateTeamAndUsers();

    // Create a game using the service under test
    const created = await createGameResult({
      event_team_id: eventTeamId,
      event_game_template_id: templateId,
      game_id: 1234,
      score: 25,
      zero_reason: null,
      bottom_deck_risk: 3,
      notes: 'Hydration test game',
      played_at: '2030-01-01T20:00:00Z',
    });

    // Seed participants directly into game_participants
    for (const userId of playerIds) {
      await pool.query(
        `
        INSERT INTO game_participants (event_game_id, user_id)
        VALUES ($1, $2);
        `,
        [created.id, userId],
      );
    }

    const detail = await getGameResultById(created.id);

    expect(detail).not.toBeNull();
    if (!detail) return;

    expect(detail.id).toBe(created.id);
    expect(detail.score).toBe(25);
    expect(detail.zero_reason).toBeNull();

    expect(detail.event_id).toBe(eventId);
    expect(detail.event_stage_id).toBe(eventStageId);
    expect(detail.stage_index).toBe(stageIndex);
    expect(detail.template_index).toBe(templateIndex);
    expect(detail.event_team_name).toBe(eventTeamName);
    expect(detail.player_count).toBe(playerCount);

    const playersSorted = [...detail.players].sort();
    expect(playersSorted).toEqual(playerNames.slice().sort());
  });

  it('createGameResult inserts a new game record for a fresh (team, template) pair', async () => {
    const { templateId, eventTeamId } = await setupEventTemplateTeamAndUsers();

    const row = await createGameResult({
      event_team_id: eventTeamId,
      event_game_template_id: templateId,
      game_id: 9999,
      score: 19,
      zero_reason: 'Time Out' as ZeroReason,
      bottom_deck_risk: 4,
      notes: 'Unit test game result',
      played_at: '2030-05-01T20:00:00Z',
    });

    expect(row.id).toBeGreaterThan(0);
    expect(row.event_team_id).toBe(eventTeamId);
    expect(row.event_game_template_id).toBe(templateId);
    expect(row.score).toBe(19);
    expect(row.zero_reason).toBe('Time Out');
    expect(row.bottom_deck_risk).toBe(4);

    const dbCheck = await pool.query(
      `
      SELECT score, zero_reason, bottom_deck_risk, notes
      FROM event_games
      WHERE id = $1
      `,
      [row.id],
    );
    expect(dbCheck.rowCount).toBe(1);
    expect(dbCheck.rows[0].score).toBe(19);
    expect(dbCheck.rows[0].zero_reason).toBe('Time Out');
    expect(dbCheck.rows[0].bottom_deck_risk).toBe(4);
    expect(dbCheck.rows[0].notes).toBe('Unit test game result');
  });

  it('createGameResult rejects duplicate (team, template) with GAME_RESULT_EXISTS', async () => {
    const { templateId, eventTeamId } = await setupEventTemplateTeamAndUsers();

    const first = await createGameResult({
      event_team_id: eventTeamId,
      event_game_template_id: templateId,
      game_id: 10001,
      score: 10,
      zero_reason: null,
    });
    expect(first.id).toBeGreaterThan(0);

    const expectedError: GameResultErrorShape = {
      code: 'GAME_RESULT_EXISTS',
    };

    await expect(
      createGameResult({
        event_team_id: eventTeamId,
        event_game_template_id: templateId,
        game_id: 10002,
        score: 5,
        zero_reason: null,
      }),
    ).rejects.toMatchObject(expectedError);
  });
});
