/**
 * Seeds the test database with a realistic dataset for performance testing.
 *
 * Inserts:
 *   500 users
 *   1,000 tickets (across all types, domains, and statuses)
 *   5,000 comments
 *   10,000 votes
 */
import type { Sql } from 'postgres';

export interface SeedResult {
  userIds: string[];
  ticketIds: string[];
  typeIds: number[];
  domainIds: number[];
  statusIds: number[];
  submittedStatusId: number;
  openStatusId: number;
}

export async function seedPerformanceData(sql: Sql): Promise<SeedResult> {
  // Resolve lookup IDs
  const types = await sql<{ id: number }[]>`SELECT id FROM ticket_types ORDER BY id`;
  const domains = await sql<{ id: number }[]>`SELECT id FROM domains ORDER BY id`;
  const statuses = await sql<{ id: number; slug: string; is_terminal: boolean }[]>`
    SELECT id, slug, is_terminal FROM statuses ORDER BY id
  `;

  const typeIds = types.map((r) => r.id);
  const domainIds = domains.map((r) => r.id);
  const statusIds = statuses.map((r) => r.id);

  const submittedStatus = statuses.find((s) => s.slug === 'submitted');
  const openStatus = statuses.find((s) => s.slug === 'open');
  if (!submittedStatus || !openStatus) throw new Error('seed: expected statuses not found');

  // Insert 500 users in bulk using unnest
  const usernames = Array.from({ length: 500 }, (_, i) => `perf_user_${i}`);
  const displayNames = Array.from({ length: 500 }, (_, i) => `Perf User ${i}`);

  const insertedUsers = await sql<{ id: string }[]>`
    INSERT INTO users (hanablive_username, display_name)
    SELECT * FROM unnest(
      ${sql.array(usernames)}::TEXT[],
      ${sql.array(displayNames)}::TEXT[]
    )
    RETURNING id
  `;
  const userIds = insertedUsers.map((r) => r.id);

  // Insert 1,000 tickets spread across types, domains, and statuses
  const ticketTitles = Array.from(
    { length: 1000 },
    (_, i) => `Performance test ticket number ${i}`,
  );
  const ticketDescs = Array.from(
    { length: 1000 },
    (_, i) =>
      `This is the description for performance test ticket ${i}. It contains enough text to exercise the full-text search index and give the planner realistic data to work with.`,
  );
  const ticketTypeIds = Array.from({ length: 1000 }, (_, i) => typeIds[i % typeIds.length]!);
  const ticketDomainIds = Array.from({ length: 1000 }, (_, i) => domainIds[i % domainIds.length]!);
  const ticketSubmittedBys = Array.from({ length: 1000 }, (_, i) => userIds[i % userIds.length]!);
  const ticketStatusIds = Array.from({ length: 1000 }, (_, i) => statusIds[i % statusIds.length]!);

  const insertedTickets = await sql<{ id: string }[]>`
    INSERT INTO tickets (title, description, type_id, domain_id, submitted_by, current_status_id)
    SELECT * FROM unnest(
      ${sql.array(ticketTitles)}::TEXT[],
      ${sql.array(ticketDescs)}::TEXT[],
      ${sql.array(ticketTypeIds)}::SMALLINT[],
      ${sql.array(ticketDomainIds)}::SMALLINT[],
      ${sql.array(ticketSubmittedBys)}::UUID[],
      ${sql.array(ticketStatusIds)}::SMALLINT[]
    )
    RETURNING id
  `;
  const ticketIds = insertedTickets.map((r) => r.id);

  // Insert 5,000 comments (5 per ticket)
  const commentTicketIds = Array.from({ length: 5000 }, (_, i) => ticketIds[i % ticketIds.length]!);
  const commentAuthorIds = Array.from(
    { length: 5000 },
    (_, i) => userIds[(i * 7) % userIds.length]!,
  );
  const commentBodies = Array.from(
    { length: 5000 },
    (_, i) => `Comment ${i} on this ticket. Some text to make it realistic.`,
  );
  const commentIsInternal = Array.from({ length: 5000 }, (_, i) => i % 10 === 0);

  await sql`
    INSERT INTO ticket_comments (ticket_id, author_id, body, is_internal)
    SELECT * FROM unnest(
      ${sql.array(commentTicketIds)}::UUID[],
      ${sql.array(commentAuthorIds)}::UUID[],
      ${sql.array(commentBodies)}::TEXT[],
      ${sql.array(commentIsInternal)}::BOOLEAN[]
    )
  `;

  // Insert 10,000 votes: 10 unique voters per ticket, capped by unique constraint.
  // We insert (ticket_id, user_id) pairs ensuring uniqueness within the batch.
  const voteTicketIds: string[] = [];
  const voteUserIds: string[] = [];
  for (let t = 0; t < ticketIds.length; t++) {
    for (let v = 0; v < 10; v++) {
      voteTicketIds.push(ticketIds[t]!);
      voteUserIds.push(userIds[(t * 10 + v) % userIds.length]!);
    }
  }

  await sql`
    INSERT INTO ticket_votes (ticket_id, user_id)
    SELECT * FROM unnest(
      ${sql.array(voteTicketIds)}::UUID[],
      ${sql.array(voteUserIds)}::UUID[]
    )
    ON CONFLICT (ticket_id, user_id) DO NOTHING
  `;

  // Flag 50 tickets ready for review to exercise the partial index
  const reviewTicketIds = ticketIds.slice(0, 50);
  const reviewFlaggedBys = reviewTicketIds.map((_, i) => userIds[(i * 3) % userIds.length]!);
  await sql`
    UPDATE tickets SET
      ready_for_review_at = now() - (random() * interval '7 days'),
      flagged_by = u.flagged_by_id
    FROM (
      SELECT unnest(${sql.array(reviewTicketIds)}::UUID[]) AS ticket_id,
             unnest(${sql.array(reviewFlaggedBys)}::UUID[]) AS flagged_by_id
    ) AS u
    WHERE tickets.id = u.ticket_id
  `;

  return {
    userIds,
    ticketIds,
    typeIds,
    domainIds,
    statusIds,
    submittedStatusId: submittedStatus.id,
    openStatusId: openStatus.id,
  };
}
