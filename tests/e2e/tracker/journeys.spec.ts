/**
 * Tracker E2E journey tests — all 9 user journeys.
 *
 * Status slugs used in these tests match the seed data in
 * 20260327000000_core_lookup_tables.sql:
 *   submitted → triaged → in_review → decided → resolved | closed
 *                       ↘ rejected | closed
 *
 * Each journey uses:
 *   - seedUsers() to reset ticket data and upsert test users with roles
 *   - apiAs() for API calls authenticated as a specific user
 *   - navigateAs() for browser navigation as a specific user
 *
 * Tests run sequentially (workers: 1) and each test calls seedUsers() to
 * start from a clean slate.
 */
import { test, expect } from '@playwright/test';
import { seedUsers, apiAs, navigateAs } from './fixtures.js';

const baseUrl = process.env['TRACKER_E2E_URL'] ?? 'http://127.0.0.1:4002';

// ---------------------------------------------------------------------------
// Journey 1: Community member submits a ticket, sees it in My Tickets,
//            receives a notification when status changes (triage).
// ---------------------------------------------------------------------------
test('Journey 1: ticket submission, my tickets, status-change notification', async ({
  page,
  request,
}) => {
  const { byUsername } = await seedUsers(request, [
    { username: 'e2e-alice', role: 'community_member' },
    { username: 'e2e-mod', role: 'moderator' },
  ]);

  const alice = apiAs(request, 'e2e-alice');
  const mod = apiAs(request, 'e2e-mod');

  // 1. Get lookups
  const lookupsRes = await alice.get('/tracker/api/lookups');
  expect(lookupsRes.status()).toBe(200);
  const lookups = (await lookupsRes.json()) as {
    ticket_types: { id: number; slug: string }[];
    domains: { id: number; slug: string }[];
  };
  const bugType = lookups.ticket_types.find((t) => t.slug === 'bug')!;
  const gameplayDomain = lookups.domains.find((d) => d.slug === 'gameplay')!;

  // 2. Submit a ticket as alice
  const createRes = await alice.post('/tracker/api/tickets', {
    title: 'Journey 1 test ticket',
    description: 'A ticket submitted during E2E journey 1.',
    type_id: bugType.id,
    domain_id: gameplayDomain.id,
    severity: 'functional',
    reproducibility: 'always',
  });
  expect(createRes.status()).toBe(201);
  const { id: ticketId } = (await createRes.json()) as { id: string };
  expect(ticketId).toBeTruthy();

  // 3. Alice navigates to the ticket list — her ticket should appear
  await navigateAs(page, 'e2e-alice', '/');
  await expect(page.getByText('Journey 1 test ticket')).toBeVisible();

  // 4. Moderator triages the ticket: submitted → triaged
  const transitionRes = await mod.patch(`/tracker/api/tickets/${ticketId}/status`, {
    to_status: 'triaged',
  });
  expect(transitionRes.status()).toBe(200);

  // 5. Alice checks notifications — should have a status_changed notification
  const notifRes = await alice.get('/tracker/api/me/notifications');
  expect(notifRes.status()).toBe(200);
  const notifBody = (await notifRes.json()) as {
    notifications: { event_type: string; ticket_id: string }[];
    unread_count: number;
  };
  expect(notifBody.unread_count).toBeGreaterThanOrEqual(1);
  const statusNotif = notifBody.notifications.find(
    (n) => n.event_type === 'status_changed' && n.ticket_id === ticketId,
  );
  expect(statusNotif).toBeDefined();

  // 6. Alice navigates to notifications page
  await navigateAs(page, 'e2e-alice', '/notifications');
  await expect(page.getByText('Journey 1 test ticket')).toBeVisible();

  void byUsername; // used for type-checking only
});

// ---------------------------------------------------------------------------
// Journey 2: Moderator triages a submitted ticket.
// ---------------------------------------------------------------------------
test('Journey 2: moderator triages submitted ticket', async ({ page, request }) => {
  await seedUsers(request, [
    { username: 'e2e-submitter', role: 'community_member' },
    { username: 'e2e-triager', role: 'moderator' },
  ]);

  const submitter = apiAs(request, 'e2e-submitter');
  const triager = apiAs(request, 'e2e-triager');

  const lookupsRes = await submitter.get('/tracker/api/lookups');
  const lookups = (await lookupsRes.json()) as {
    ticket_types: { id: number; slug: string }[];
    domains: { id: number; slug: string }[];
  };
  const featureType = lookups.ticket_types.find((t) => t.slug === 'feature_request')!;
  const scoringDomain = lookups.domains.find((d) => d.slug === 'scoring')!;

  // Submitter creates ticket
  const createRes = await submitter.post('/tracker/api/tickets', {
    title: 'Journey 2 feature request',
    description: 'Feature request for triage journey.',
    type_id: featureType.id,
    domain_id: scoringDomain.id,
  });
  expect(createRes.status()).toBe(201);
  const { id: ticketId } = (await createRes.json()) as { id: string };

  // Moderator navigates to ticket list and sees submitted ticket
  await navigateAs(page, 'e2e-triager', '/');
  await expect(page.getByText('Journey 2 feature request')).toBeVisible();

  // Moderator triages ticket: submitted → triaged
  const transitionRes = await triager.patch(`/tracker/api/tickets/${ticketId}/status`, {
    to_status: 'triaged',
  });
  expect(transitionRes.status()).toBe(200);
  const { status_slug } = (await transitionRes.json()) as { status_slug: string };
  expect(status_slug).toBe('triaged');

  // Moderator navigates to ticket detail page — status should show "triaged"
  await navigateAs(page, 'e2e-triager', `/tickets/${ticketId}`);
  await expect(page.getByText(/triaged/i)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Journey 3: Moderator requests clarification via comment; submitter responds.
// (No 'needs_clarification' status in the schema — clarification happens via
//  comments on a triaged ticket.)
// ---------------------------------------------------------------------------
test('Journey 3: clarification request comment and submitter response', async ({
  page,
  request,
}) => {
  await seedUsers(request, [
    { username: 'e2e-asker', role: 'community_member' },
    { username: 'e2e-clarifier', role: 'moderator' },
  ]);

  const asker = apiAs(request, 'e2e-asker');
  const clarifier = apiAs(request, 'e2e-clarifier');

  const lookupsRes = await asker.get('/tracker/api/lookups');
  const lookups = (await lookupsRes.json()) as {
    ticket_types: { id: number; slug: string }[];
    domains: { id: number; slug: string }[];
  };
  const bugType = lookups.ticket_types.find((t) => t.slug === 'bug')!;
  const uiDomain = lookups.domains.find((d) => d.slug === 'interface')!;

  // Submitter creates ticket
  const createRes = await asker.post('/tracker/api/tickets', {
    title: 'Journey 3 bug report',
    description: 'Bug that needs clarification.',
    type_id: bugType.id,
    domain_id: uiDomain?.id ?? lookups.domains[0]!.id,
  });
  expect(createRes.status()).toBe(201);
  const { id: ticketId } = (await createRes.json()) as { id: string };

  // Moderator triages ticket first (submitted → triaged)
  await clarifier.patch(`/tracker/api/tickets/${ticketId}/status`, { to_status: 'triaged' });

  // Moderator posts a public comment requesting clarification
  const commentRes = await clarifier.post(`/tracker/api/tickets/${ticketId}/comments`, {
    body: 'Can you provide more steps to reproduce?',
    is_internal: false,
  });
  expect(commentRes.status()).toBe(201);

  // Submitter checks notifications — comment_added notification expected
  const notifRes = await asker.get('/tracker/api/me/notifications');
  const notifBody = (await notifRes.json()) as {
    notifications: { event_type: string; ticket_id: string }[];
    unread_count: number;
  };
  expect(notifBody.unread_count).toBeGreaterThanOrEqual(1);

  // Submitter navigates to the ticket and sees the clarification request
  await navigateAs(page, 'e2e-asker', `/tickets/${ticketId}`);
  await expect(page.getByText('Can you provide more steps to reproduce?')).toBeVisible();

  // Submitter posts a reply via API
  const replyRes = await asker.post(`/tracker/api/tickets/${ticketId}/comments`, {
    body: 'It happens every time I click the score button.',
    is_internal: false,
  });
  expect(replyRes.status()).toBe(201);

  // Verify both comments are visible in the thread
  await page.reload();
  await expect(page.getByText('It happens every time I click the score button.')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Journey 4: Community member votes on a triaged ticket; vote count updates.
// ---------------------------------------------------------------------------
test('Journey 4: vote on ticket and verify count', async ({ page, request }) => {
  await seedUsers(request, [
    { username: 'e2e-voter', role: 'community_member' },
    { username: 'e2e-opener', role: 'moderator' },
  ]);

  const voter = apiAs(request, 'e2e-voter');
  const opener = apiAs(request, 'e2e-opener');

  const lookupsRes = await voter.get('/tracker/api/lookups');
  const lookups = (await lookupsRes.json()) as {
    ticket_types: { id: number; slug: string }[];
    domains: { id: number; slug: string }[];
  };
  const feedbackType = lookups.ticket_types.find((t) => t.slug === 'feedback')!;

  // Create ticket and triage it
  const createRes = await voter.post('/tracker/api/tickets', {
    title: 'Journey 4 feedback ticket',
    description: 'Feedback for vote journey.',
    type_id: feedbackType?.id ?? lookups.ticket_types[0]!.id,
    domain_id: lookups.domains[0]!.id,
  });
  expect(createRes.status()).toBe(201);
  const { id: ticketId } = (await createRes.json()) as { id: string };

  // Triage the ticket so it's eligible for voting
  await opener.patch(`/tracker/api/tickets/${ticketId}/status`, { to_status: 'triaged' });

  // Check initial vote state
  const initialVoteRes = await voter.get(`/tracker/api/tickets/${ticketId}/votes`);
  const initialVote = (await initialVoteRes.json()) as {
    vote_count: number;
    user_has_voted: boolean;
  };
  expect(initialVote.vote_count).toBe(0);
  expect(initialVote.user_has_voted).toBe(false);

  // Voter navigates to ticket page
  await navigateAs(page, 'e2e-voter', `/tickets/${ticketId}`);
  await expect(page.getByText('Journey 4 feedback ticket')).toBeVisible();

  // Voter casts a vote via API (action: 'add', returns updated vote state)
  const voteRes = await voter.post(`/tracker/api/tickets/${ticketId}/votes`, { action: 'add' });
  expect(voteRes.status()).toBe(200);

  // Vote count should now be 1
  const afterVoteRes = await voter.get(`/tracker/api/tickets/${ticketId}/votes`);
  const afterVote = (await afterVoteRes.json()) as {
    vote_count: number;
    user_has_voted: boolean;
  };
  expect(afterVote.vote_count).toBe(1);
  expect(afterVote.user_has_voted).toBe(true);

  // Voter can unvote
  const unvoteRes = await voter.post(`/tracker/api/tickets/${ticketId}/votes`, { action: 'remove' });
  expect(unvoteRes.status()).toBe(200);

  const afterUnvoteRes = await voter.get(`/tracker/api/tickets/${ticketId}/votes`);
  const afterUnvote = (await afterUnvoteRes.json()) as {
    vote_count: number;
    user_has_voted: boolean;
  };
  expect(afterUnvote.vote_count).toBe(0);
  expect(afterUnvote.user_has_voted).toBe(false);
});

// ---------------------------------------------------------------------------
// Journey 5: Moderator flags for review; committee sees it in the queue.
// ---------------------------------------------------------------------------
test('Journey 5: flag for review and committee queue', async ({ request }) => {
  await seedUsers(request, [
    { username: 'e2e-reporter', role: 'community_member' },
    { username: 'e2e-flagger', role: 'moderator' },
    { username: 'e2e-committee5', role: 'committee' },
  ]);

  const reporter = apiAs(request, 'e2e-reporter');
  const flagger = apiAs(request, 'e2e-flagger');
  const committee = apiAs(request, 'e2e-committee5');

  const lookupsRes = await reporter.get('/tracker/api/lookups');
  const lookups = (await lookupsRes.json()) as {
    ticket_types: { id: number; slug: string }[];
    domains: { id: number; slug: string }[];
  };

  // Create and triage a ticket
  const createRes = await reporter.post('/tracker/api/tickets', {
    title: 'Journey 5 ticket for review',
    description: 'This ticket needs committee attention.',
    type_id: lookups.ticket_types[0]!.id,
    domain_id: lookups.domains[0]!.id,
  });
  expect(createRes.status()).toBe(201);
  const { id: ticketId } = (await createRes.json()) as { id: string };

  // Triage the ticket first
  await flagger.patch(`/tracker/api/tickets/${ticketId}/status`, { to_status: 'triaged' });

  // Moderator flags it for committee review (returns 204 No Content)
  const flagRes = await flagger.post(`/tracker/api/tickets/${ticketId}/flag`);
  expect(flagRes.status()).toBe(204);

  // Committee sees the ticket in the ready-for-review queue
  const queueRes = await committee.get('/tracker/api/tickets/ready-for-review');
  expect(queueRes.status()).toBe(200);
  const queue = (await queueRes.json()) as { tickets: { id: string }[] };
  const flagged = queue.tickets.find((t) => t.id === ticketId);
  expect(flagged).toBeDefined();
});

// ---------------------------------------------------------------------------
// Journey 6: Committee rejects a ticket with a resolution note; submitter notified.
// (Flow: submitted → triaged → rejected by committee with note.)
// ---------------------------------------------------------------------------
test('Journey 6: committee rejection with resolution note', async ({ request }) => {
  await seedUsers(request, [
    { username: 'e2e-rej-sub', role: 'community_member' },
    { username: 'e2e-rej-mod', role: 'moderator' },
    { username: 'e2e-rej-com', role: 'committee' },
  ]);

  const sub = apiAs(request, 'e2e-rej-sub');
  const mod = apiAs(request, 'e2e-rej-mod');
  const com = apiAs(request, 'e2e-rej-com');

  const lookupsRes = await sub.get('/tracker/api/lookups');
  const lookups = (await lookupsRes.json()) as {
    ticket_types: { id: number; slug: string }[];
    domains: { id: number; slug: string }[];
  };

  // Create and triage a ticket
  const createRes = await sub.post('/tracker/api/tickets', {
    title: 'Journey 6 rejected ticket',
    description: 'This ticket will be rejected by the committee.',
    type_id: lookups.ticket_types[0]!.id,
    domain_id: lookups.domains[0]!.id,
  });
  expect(createRes.status()).toBe(201);
  const { id: ticketId } = (await createRes.json()) as { id: string };

  // Moderator triages
  await mod.patch(`/tracker/api/tickets/${ticketId}/status`, { to_status: 'triaged' });

  // Committee rejects with a resolution note (triaged → rejected)
  const rejectRes = await com.patch(`/tracker/api/tickets/${ticketId}/status`, {
    to_status: 'rejected',
    resolution_note: 'This is out of scope for the current roadmap.',
  });
  expect(rejectRes.status()).toBe(200);

  // Verify ticket is now rejected (terminal status)
  const ticketRes = await sub.get(`/tracker/api/tickets/${ticketId}`);
  const ticket = (await ticketRes.json()) as { status_slug: string };
  expect(ticket.status_slug).toBe('rejected');

  // Submitter receives a status_changed notification
  const notifRes = await sub.get('/tracker/api/me/notifications');
  const notif = (await notifRes.json()) as {
    notifications: { event_type: string; ticket_id: string }[];
    unread_count: number;
  };
  expect(notif.unread_count).toBeGreaterThanOrEqual(1);
  const rejectNotif = notif.notifications.find(
    (n) => n.event_type === 'status_changed' && n.ticket_id === ticketId,
  );
  expect(rejectNotif).toBeDefined();
});

// ---------------------------------------------------------------------------
// Journey 7: Duplicate detection — submitter finds existing ticket and votes.
// ---------------------------------------------------------------------------
test('Journey 7: duplicate detection via search, vote instead of submit', async ({
  page,
  request,
}) => {
  await seedUsers(request, [
    { username: 'e2e-dup-original', role: 'community_member' },
    { username: 'e2e-dup-finder', role: 'community_member' },
    { username: 'e2e-dup-mod', role: 'moderator' },
  ]);

  const original = apiAs(request, 'e2e-dup-original');
  const finder = apiAs(request, 'e2e-dup-finder');
  const mod = apiAs(request, 'e2e-dup-mod');

  const lookupsRes = await original.get('/tracker/api/lookups');
  const lookups = (await lookupsRes.json()) as {
    ticket_types: { id: number; slug: string }[];
    domains: { id: number; slug: string }[];
  };
  const bugType = lookups.ticket_types.find((t) => t.slug === 'bug')!;

  // Original submitter creates a ticket with a unique searchable phrase
  const createRes = await original.post('/tracker/api/tickets', {
    title: 'Score display glitch after bonus round unique',
    description:
      'The score display shows wrong values after the bonus round in some configurations.',
    type_id: bugType.id,
    domain_id: lookups.domains[0]!.id,
  });
  expect(createRes.status()).toBe(201);
  const { id: existingTicketId } = (await createRes.json()) as { id: string };

  // Triage the ticket so it's searchable (non-terminal)
  await mod.patch(`/tracker/api/tickets/${existingTicketId}/status`, { to_status: 'triaged' });

  // Finder navigates to the ticket list (would normally use submit page)
  await navigateAs(page, 'e2e-dup-finder', '/');

  // Finder searches via API for the same issue
  const searchRes = await finder.get(
    '/tracker/api/tickets/search?q=score+display+glitch+bonus+round',
  );
  expect(searchRes.status()).toBe(200);
  const searchResult = (await searchRes.json()) as { tickets: { id: string; title: string }[] };
  expect(searchResult.tickets.length).toBeGreaterThanOrEqual(1);
  const found = searchResult.tickets.find((t) => t.id === existingTicketId);
  expect(found).toBeDefined();

  // Finder votes on the existing ticket instead of creating a duplicate
  const voteRes = await finder.post(`/tracker/api/tickets/${existingTicketId}/votes`, { action: 'add' });
  expect(voteRes.status()).toBe(200);

  const voteState = (await (
    await finder.get(`/tracker/api/tickets/${existingTicketId}/votes`)
  ).json()) as { vote_count: number; user_has_voted: boolean };
  expect(voteState.vote_count).toBe(1);
  expect(voteState.user_has_voted).toBe(true);
});

// ---------------------------------------------------------------------------
// Journey 8: Committee assigns moderator role; new moderator can triage.
// ---------------------------------------------------------------------------
test('Journey 8: role assignment — new moderator can triage', async ({ page, request }) => {
  const { byUsername } = await seedUsers(request, [
    { username: 'e2e-new-mod', role: 'community_member' },
    { username: 'e2e-admin8', role: 'committee' },
    { username: 'e2e-submitter8', role: 'community_member' },
  ]);

  const newMod = apiAs(request, 'e2e-new-mod');
  const admin = apiAs(request, 'e2e-admin8');
  const submitter = apiAs(request, 'e2e-submitter8');

  const lookupsRes = await submitter.get('/tracker/api/lookups');
  const lookups = (await lookupsRes.json()) as {
    ticket_types: { id: number; slug: string }[];
    domains: { id: number; slug: string }[];
  };

  // Submitter creates a ticket
  const createRes = await submitter.post('/tracker/api/tickets', {
    title: 'Journey 8 ticket to triage',
    description: 'This ticket will be triaged after role assignment.',
    type_id: lookups.ticket_types[0]!.id,
    domain_id: lookups.domains[0]!.id,
  });
  expect(createRes.status()).toBe(201);
  const { id: ticketId } = (await createRes.json()) as { id: string };

  // new-mod cannot triage yet (community_member lacks ticket.transition permission)
  const failRes = await newMod.patch(`/tracker/api/tickets/${ticketId}/status`, {
    to_status: 'triaged',
  });
  expect(failRes.status()).toBe(403);

  // Committee member navigates to admin users page
  await navigateAs(page, 'e2e-admin8', '/admin/users');
  await expect(page.getByText('e2e-new-mod').first()).toBeVisible();

  // Committee assigns moderator role via API
  const newModUserId = byUsername.get('e2e-new-mod')!.id;
  const assignRes = await admin.post(`/tracker/api/users/${newModUserId}/roles`, {
    role: 'moderator',
  });
  expect(assignRes.status()).toBe(201);

  // Now new-mod can triage (moderator has ticket.transition permission)
  const triageRes = await newMod.patch(`/tracker/api/tickets/${ticketId}/status`, {
    to_status: 'triaged',
  });
  expect(triageRes.status()).toBe(200);

  // Admin users page reflects the role update
  await page.reload();
  await expect(page.getByText('moderator')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Journey 9: Discord identity link via mocked bot interaction.
// ---------------------------------------------------------------------------
test('Journey 9: Discord identity link via mocked bot', async ({ page, request }) => {
  const { byUsername } = await seedUsers(request, [
    { username: 'e2e-discord-user', role: 'community_member' },
    { username: 'e2e-discord-admin', role: 'committee' },
  ]);

  const discordUser = apiAs(request, 'e2e-discord-user');
  const admin = apiAs(request, 'e2e-discord-admin');

  // Simulate the Discord bot linking the identity via the test-only endpoint.
  // In production, the Discord /token slash command triggers this flow;
  // the test endpoint is the CI stand-in that bypasses the real Discord API.
  const linkRes = await discordUser.post('/tracker/api/test/discord-link', {
    discord_user_id: 'mock-discord-id-12345',
    discord_username: 'discord_e2e_user#0001',
  });
  expect(linkRes.status()).toBe(200);

  // Admin views the users page — user should appear as Discord-linked
  await navigateAs(page, 'e2e-discord-admin', '/admin/users');
  await expect(page.getByText('e2e-discord-user').first()).toBeVisible();

  // Verify via API that the user is Discord-linked
  const usersRes = await admin.get('/tracker/api/users');
  expect(usersRes.status()).toBe(200);
  const usersBody = (await usersRes.json()) as {
    users: { hanablive_username: string; discord_linked: boolean }[];
  };
  const linkedUser = usersBody.users.find((u) => u.hanablive_username === 'e2e-discord-user');
  expect(linkedUser).toBeDefined();
  expect(linkedUser!.discord_linked).toBe(true);

  void byUsername; // used above
});
