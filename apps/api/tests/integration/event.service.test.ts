import { describe, it, expect, beforeEach } from 'vitest';
import { pool } from '../../src/config/db';
import {
  listEvents,
  listEventGameTemplates,
  listEventTeams,
  createEvent,
  createEventGameTemplate,
  getEventBySlug,
  createEventStage,
} from '../../src/modules/events/event.service';

interface EventServiceErrorShape {
  code: string;
}

describe('event.service (integration)', () => {
  const TEST_EVENT_NAME = 'Unit Test Event';
  const TEST_EVENT_SLUG = 'unit-test-event';

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

  it('listEvents returns the events inserted in this test', async () => {
    const now = new Date().toISOString();

    await pool.query(
      `
      INSERT INTO events (name, slug, short_description, long_description, starts_at, ends_at, published)
      VALUES 
        ($1, $2, $3, $4, $5, $6, TRUE),
        ($7, $8, $9, $10, $11, $12, TRUE);
      `,
      [
        'No Variant 2025',
        'no-variant-2025',
        'short 2025',
        'long 2025',
        now,
        now,
        'No Variant 2026',
        'no-variant-2026',
        'short 2026',
        'long 2026',
        now,
        now,
      ],
    );

    const events = await listEvents();
    const names = events.map((c) => c.name);

    expect(names).toContain('No Variant 2025');
    expect(names).toContain('No Variant 2026');
    expect(events.length).toBe(2);
  });

  it('listEventGameTemplates returns the templates for the given event', async () => {
    const eventRes = await pool.query(
      `
      INSERT INTO events (name, slug, short_description, long_description)
      VALUES ($1, $2, $3, $4)
      RETURNING id;
      `,
      [
        'Template Test Event',
        'template-test-event',
        'short',
        'long description for templates test',
      ],
    );
    const eventId = eventRes.rows[0].id as number;

    const stageRes = await createEventStage({
      event_id: eventId,
      stage_index: 1,
      label: 'Stage 1',
      stage_type: 'SINGLE',
    });

    await pool.query(
      `
      INSERT INTO event_game_templates (event_stage_id, template_index, variant, seed_payload)
      VALUES 
        ($1, 1, 'BASE', 'TEMPLATE-1'),
        ($1, 2, 'BASE', 'TEMPLATE-2'),
        ($1, 3, 'BASE', 'TEMPLATE-3'),
        ($1, 4, 'BASE', 'TEMPLATE-4'),
        ($1, 5, 'BASE', 'TEMPLATE-5');
      `,
      [stageRes.event_stage_id],
    );

    const templates = await listEventGameTemplates(eventId);
    const payloads = templates.map((s) => s.seed_payload);

    expect(templates.length).toBe(5);
    expect(payloads).toEqual(
      expect.arrayContaining([
        'TEMPLATE-1',
        'TEMPLATE-2',
        'TEMPLATE-3',
        'TEMPLATE-4',
        'TEMPLATE-5',
      ]),
    );
  });

  it('listEventTeams returns the teams for the given event', async () => {
    const eventRes = await pool.query(
      `
      INSERT INTO events (name, slug, short_description, long_description)
      VALUES ($1, $2, $3, $4)
      RETURNING id;
      `,
      ['Teams Test Event', 'teams-test-event', 'short', 'long description for teams test'],
    );
    const eventId = eventRes.rows[0].id as number;

    await pool.query(
      `
      INSERT INTO event_teams (name, event_id, team_size)
      VALUES ($1, $2, 3), ($3, $2, 3)
      RETURNING id, name;
      `,
      ['Lanterns', eventId, 'Clue Crew'],
    );

    const teams = await listEventTeams(eventId);
    const names = teams.map((t) => t.name);

    expect(names).toContain('Lanterns');
    expect(names).toContain('Clue Crew');
  });

  it('createEvent inserts a new event and rejects duplicates', async () => {
    const event = await createEvent({
      name: TEST_EVENT_NAME,
      slug: TEST_EVENT_SLUG,
      short_description: 'unit test event (short)',
      long_description: 'unit test event (long description for testing)',
      starts_at: '2030-01-01T00:00:00Z',
      ends_at: '2030-12-31T23:59:59Z',
    });

    expect(event.id).toBeGreaterThan(0);
    expect(event.name).toBe(TEST_EVENT_NAME);

    const expectedError: EventServiceErrorShape = {
      code: 'EVENT_NAME_EXISTS',
    };

    await expect(
      createEvent({
        name: TEST_EVENT_NAME,
        slug: TEST_EVENT_SLUG,
        short_description: 'duplicate (short)',
        long_description: 'duplicate (long)',
      }),
    ).rejects.toMatchObject(expectedError);
  });

  it('createEventGameTemplate inserts a new template and rejects duplicates', async () => {
    const event = await createEvent({
      name: TEST_EVENT_NAME,
      slug: TEST_EVENT_SLUG,
      short_description: 'template parent',
      long_description: 'template parent long description',
    });

    const stage = await createEventStage({
      event_id: event.id,
      stage_index: 1,
      label: 'Stage 1',
      stage_type: 'SINGLE',
    });

    const template = await createEventGameTemplate(stage.event_stage_id, {
      template_index: 99,
      variant: 'UNIT',
      seed_payload: 'UNIT-TEST-TEMPLATE',
    });

    expect(template.id).toBeGreaterThan(0);
    expect(template.event_stage_id).toBe(stage.event_stage_id);
    expect(template.template_index).toBe(99);

    const expectedError: EventServiceErrorShape = {
      code: 'EVENT_GAME_TEMPLATE_EXISTS',
    };

    await expect(
      createEventGameTemplate(stage.event_stage_id, {
        template_index: 99,
        variant: 'UNIT',
        seed_payload: 'UNIT-TEST-TEMPLATE-2',
      }),
    ).rejects.toMatchObject(expectedError);
  });

  it('getEventBySlug returns an event created in this test', async () => {
    const now = new Date().toISOString();
    const slug = 'no-var-2025';

    await pool.query(
      `
      INSERT INTO events (name, slug, short_description, long_description, starts_at, ends_at, published)
      VALUES ($1, $2, $3, $4, $5, $6, TRUE);
      `,
      ['No Variant 2025', slug, 'short desc', 'Long description text', now, now],
    );

    const event = await getEventBySlug(slug);

    expect(event).not.toBeNull();
    expect(event?.slug).toBe(slug);
    expect(event?.name).toBe('No Variant 2025');
    expect(event?.long_description).toBeTruthy();
  });

  it('getEventBySlug returns null when slug does not exist', async () => {
    const event = await getEventBySlug('this-slug-does-not-exist');
    expect(event).toBeNull();
  });
});
