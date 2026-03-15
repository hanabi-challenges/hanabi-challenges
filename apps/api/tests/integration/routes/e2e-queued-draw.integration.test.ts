/**
 * T-074 — End-to-end integration test: QUEUED team draw
 *
 * Full QUEUED team formation lifecycle:
 * 1. Create QUEUED + STAGE-scope stage
 * 2. Register 5 players
 * 3. 3 players opt in solo; 2 opt in as a pre-arranged pair
 * 4. Run draw — verify pre-arranged pair is grouped; 2 solos are paired; 1 unmatched
 * 5. Confirm draw
 * 6. Verify teams created with correct members and source: QUEUED
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { pool } from '../../../src/config/db';
import { loginOrCreateUser } from '../../../src/modules/auth/auth.service';
import { post, patch } from '../../support/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createUser(displayName: string, role: 'ADMIN' | 'USER' = 'USER') {
  const { token } = await loginOrCreateUser(displayName, 'password');
  if (role !== 'USER') {
    await pool.query(`UPDATE users SET role = $1 WHERE display_name = $2`, [role, displayName]);
    const elevated = await loginOrCreateUser(displayName, 'password');
    return { token: elevated.token, userId: elevated.user.id };
  }
  const result = await loginOrCreateUser(displayName, 'password');
  return { token, userId: result.user.id };
}

async function createAndPublishEvent(token: string) {
  await post('/api/events')
    .set('Authorization', `Bearer ${token}`)
    .send({
      slug: 'e2e-queued',
      name: 'E2E Queued Draw Event',
      long_description: 'Test.',
      allowed_team_sizes: [2],
    });
  await patch('/api/events/e2e-queued/publish').set('Authorization', `Bearer ${token}`);
}

async function createQueuedStage(token: string) {
  const res = await post('/api/events/e2e-queued/stages')
    .set('Authorization', `Bearer ${token}`)
    .send({
      label: 'Queued Stage',
      mechanism: 'SEEDED_LEADERBOARD',
      team_policy: 'QUEUED',
      team_scope: 'STAGE',
      attempt_policy: 'SINGLE',
      time_policy: 'WINDOW',
    });
  return res.body as { id: number };
}

async function register(token: string) {
  return post('/api/events/e2e-queued/register').set('Authorization', `Bearer ${token}`);
}

async function optIn(token: string, stageId: number, partnerUserId?: number) {
  return post(`/api/events/e2e-queued/stages/${stageId}/opt-in`)
    .set('Authorization', `Bearer ${token}`)
    .send(partnerUserId !== undefined ? { partner_user_id: partnerUserId } : {});
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await pool.query('TRUNCATE events, users RESTART IDENTITY CASCADE');
});

// ---------------------------------------------------------------------------
// E2E: QUEUED draw with pre-arranged pair
// ---------------------------------------------------------------------------

describe('E2E QUEUED draw — 5 players with pre-arranged pair', () => {
  it('groups pre-arranged pair and matches solo players', async () => {
    // 1. Create event + queued stage
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createQueuedStage(ownerToken);

    // 2. Register 5 players
    const { token: aliceToken, userId: aliceId } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    const { token: carolToken } = await createUser('carol');
    const { token: daveToken } = await createUser('dave');
    const { token: eveToken } = await createUser('eve');

    for (const t of [aliceToken, bobToken, carolToken, daveToken, eveToken]) {
      await register(t);
    }

    // 3. Alice and Bob opt in as pre-arranged pair (mutual opt-in)
    //    Carol, Dave, Eve opt in solo
    await optIn(aliceToken, stage.id, bobId);
    await optIn(bobToken, stage.id, aliceId);
    await optIn(carolToken, stage.id);
    await optIn(daveToken, stage.id);
    await optIn(eveToken, stage.id);

    // 4. Preview draw
    const drawRes = await post(`/api/events/e2e-queued/stages/${stage.id}/draw`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );
    expect(drawRes.status).toBe(200);

    const proposal = drawRes.body as {
      teams: Array<{ kind: string; user_ids: number[] }>;
      unmatched: number[];
    };

    // Alice+Bob should be a CONFIRMED_PAIR
    const confirmedPair = proposal.teams.find((t) => t.kind === 'CONFIRMED_PAIR');
    expect(confirmedPair).toBeDefined();
    expect(confirmedPair!.user_ids).toContain(aliceId);
    expect(confirmedPair!.user_ids).toContain(bobId);

    // Two solo players should be proposed as a pair, one unmatched
    const proposedPair = proposal.teams.find((t) => t.kind === 'PROPOSED_PAIR');
    expect(proposedPair).toBeDefined();

    // Total: 1 confirmed + 1 proposed = 2 teams, 1 unmatched
    expect(proposal.teams).toHaveLength(2);
    expect(proposal.unmatched).toHaveLength(1);

    // 5. Confirm the draw
    const confirmRes = await post(`/api/events/e2e-queued/stages/${stage.id}/draw/confirm`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );
    expect(confirmRes.status).toBe(200);

    // 6. Verify teams created with QUEUED source
    const { rows: teams } = await pool.query<{
      id: number;
      source: string;
      team_size: number;
    }>(`SELECT id, source, team_size FROM event_teams WHERE stage_id = $1 ORDER BY id`, [stage.id]);

    expect(teams).toHaveLength(2);
    teams.forEach((t) => {
      expect(t.source).toBe('QUEUED');
      expect(t.team_size).toBe(2);
    });

    // The team containing alice+bob should exist
    const { rows: aliceTeamMembers } = await pool.query<{ event_team_id: number }>(
      `SELECT event_team_id FROM event_team_members WHERE user_id = $1`,
      [aliceId],
    );
    const { rows: bobTeamMembers } = await pool.query<{ event_team_id: number }>(
      `SELECT event_team_id FROM event_team_members WHERE user_id = $1`,
      [bobId],
    );
    expect(aliceTeamMembers[0].event_team_id).toBe(bobTeamMembers[0].event_team_id);
  });
});
