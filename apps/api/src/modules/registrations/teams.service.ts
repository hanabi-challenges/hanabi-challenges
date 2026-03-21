import { pool } from '../../config/db';
import { deriveTeamDisplayName } from '../../utils/team.utils';

export type TeamMemberRow = {
  user_id: number;
  display_name: string;
  confirmed: boolean;
};

export type TeamRow = {
  id: number;
  event_id: number;
  stage_id: number | null;
  team_size: number;
  source: string;
  created_at: Date;
};

export type TeamResponse = TeamRow & {
  display_name: string;
  members: TeamMemberRow[];
  all_confirmed: boolean;
};

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function attachMembers(teams: TeamRow[]): Promise<TeamResponse[]> {
  if (teams.length === 0) return [];

  const ids = teams.map((t) => t.id);
  const membersResult = await pool.query<TeamMemberRow & { event_team_id: number }>(
    `SELECT etm.event_team_id, etm.user_id, u.display_name, etm.confirmed
     FROM event_team_members etm
     JOIN users u ON u.id = etm.user_id
     WHERE etm.event_team_id = ANY($1)
     ORDER BY u.display_name`,
    [ids],
  );

  const membersByTeam = new Map<number, TeamMemberRow[]>();
  for (const m of membersResult.rows) {
    const { event_team_id, ...member } = m;
    if (!membersByTeam.has(event_team_id)) membersByTeam.set(event_team_id, []);
    membersByTeam.get(event_team_id)!.push(member);
  }

  return teams.map((team) => {
    const members = membersByTeam.get(team.id) ?? [];
    return {
      ...team,
      members,
      display_name: deriveTeamDisplayName(members),
      all_confirmed: members.length > 0 && members.every((m) => m.confirmed),
    };
  });
}

export async function listEventTeams(eventId: number, userId?: number): Promise<TeamResponse[]> {
  let result;
  if (userId !== undefined) {
    result = await pool.query<TeamRow>(
      `SELECT DISTINCT et.*
       FROM event_teams et
       JOIN event_team_members etm ON etm.event_team_id = et.id
       WHERE et.event_id = $1 AND et.stage_id IS NULL AND etm.user_id = $2
       ORDER BY et.id`,
      [eventId, userId],
    );
  } else {
    result = await pool.query<TeamRow>(
      `SELECT * FROM event_teams WHERE event_id = $1 AND stage_id IS NULL ORDER BY id`,
      [eventId],
    );
  }
  return attachMembers(result.rows);
}

export async function getTeam(teamId: number, eventId: number): Promise<TeamResponse | null> {
  const result = await pool.query<TeamRow>(
    `SELECT * FROM event_teams WHERE id = $1 AND event_id = $2`,
    [teamId, eventId],
  );
  if ((result.rowCount ?? 0) === 0) return null;
  const teams = await attachMembers(result.rows);
  return teams[0];
}

// ---------------------------------------------------------------------------
// Create (EVENT scope)
// ---------------------------------------------------------------------------

export type EventMetaForRegistration = {
  registration_cutoff: Date | null;
  allow_late_registration: boolean;
};

export type CreateTeamResult =
  | { ok: true; team: TeamResponse }
  | { ok: false; reason: 'invalid_size' | 'registration_closed' | 'already_on_team' };

export async function createEventTeam(
  eventId: number,
  initiatorId: number,
  inviteUserIds: number[],
  allowedTeamSizes: number[],
  eventMeta: EventMetaForRegistration,
): Promise<CreateTeamResult> {
  const allMemberIds = [initiatorId, ...inviteUserIds];
  const teamSize = allMemberIds.length;

  if (!allowedTeamSizes.includes(teamSize)) {
    return { ok: false, reason: 'invalid_size' };
  }

  // Check registration cutoff before opening a transaction
  const now = new Date();
  if (
    eventMeta.registration_cutoff !== null &&
    now > eventMeta.registration_cutoff &&
    !eventMeta.allow_late_registration
  ) {
    return { ok: false, reason: 'registration_closed' };
  }

  // No member may already be on a confirmed team for this event (event-scoped)
  const existingCheck = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM event_team_members etm
     JOIN event_teams et ON et.id = etm.event_team_id
     WHERE et.event_id = $1 AND et.stage_id IS NULL
       AND etm.user_id = ANY($2)
       AND etm.confirmed = TRUE`,
    [eventId, allMemberIds],
  );
  if (parseInt(existingCheck.rows[0].count, 10) > 0) {
    return { ok: false, reason: 'already_on_team' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Auto-register all members — team creation is the registration act
    for (const uid of allMemberIds) {
      await client.query(
        `INSERT INTO event_registrations (event_id, user_id, status)
         VALUES ($1, $2, 'ACTIVE')
         ON CONFLICT (event_id, user_id) DO UPDATE
           SET status = CASE
             WHEN event_registrations.status = 'WITHDRAWN' THEN 'ACTIVE'
             ELSE event_registrations.status
           END`,
        [eventId, uid],
      );
    }

    const teamResult = await client.query<{ id: number }>(
      `INSERT INTO event_teams (event_id, stage_id, team_size, source)
       VALUES ($1, NULL, $2, 'REGISTERED')
       RETURNING id`,
      [eventId, teamSize],
    );
    const teamId = teamResult.rows[0].id;

    // Insert initiator as confirmed; invitees as unconfirmed
    for (const uid of allMemberIds) {
      await client.query(
        `INSERT INTO event_team_members (event_team_id, user_id, confirmed)
         VALUES ($1, $2, $3)`,
        [teamId, uid, uid === initiatorId],
      );
    }

    await client.query('COMMIT');

    const team = await getTeam(teamId, eventId);
    return { ok: true, team: team! };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Confirm membership
// ---------------------------------------------------------------------------

export type ConfirmResult =
  | { ok: true; team: TeamResponse }
  | { ok: false; reason: 'not_invited' | 'already_confirmed' };

export async function confirmMembership(
  teamId: number,
  eventId: number,
  userId: number,
): Promise<ConfirmResult> {
  const result = await pool.query<{ confirmed: boolean }>(
    `SELECT etm.confirmed FROM event_team_members etm
     JOIN event_teams et ON et.id = etm.event_team_id
     WHERE etm.event_team_id = $1 AND etm.user_id = $2 AND et.event_id = $3`,
    [teamId, userId, eventId],
  );

  if ((result.rowCount ?? 0) === 0) {
    return { ok: false, reason: 'not_invited' };
  }
  if (result.rows[0].confirmed) {
    return { ok: false, reason: 'already_confirmed' };
  }

  await pool.query(
    `UPDATE event_team_members SET confirmed = TRUE
     WHERE event_team_id = $1 AND user_id = $2`,
    [teamId, userId],
  );

  const team = await getTeam(teamId, eventId);
  return { ok: true, team: team! };
}

// ---------------------------------------------------------------------------
// Remove member / decline invite
// ---------------------------------------------------------------------------

export type RemoveMemberResult =
  | { ok: true; team_deleted: boolean }
  | { ok: false; reason: 'not_member' | 'has_results' };

export async function removeMember(
  teamId: number,
  eventId: number,
  targetUserId: number,
): Promise<RemoveMemberResult> {
  // Verify the member is on this team
  const memberCheck = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM event_team_members etm
     JOIN event_teams et ON et.id = etm.event_team_id
     WHERE etm.event_team_id = $1 AND etm.user_id = $2 AND et.event_id = $3`,
    [teamId, targetUserId, eventId],
  );
  if (parseInt(memberCheck.rows[0].count, 10) === 0) {
    return { ok: false, reason: 'not_member' };
  }

  // Block removal if the team has results
  const resultCheck = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM event_game_results WHERE event_team_id = $1`,
    [teamId],
  );
  if (parseInt(resultCheck.rows[0].count, 10) > 0) {
    return { ok: false, reason: 'has_results' };
  }

  await pool.query(`DELETE FROM event_team_members WHERE event_team_id = $1 AND user_id = $2`, [
    teamId,
    targetUserId,
  ]);

  // Check if team is now empty — if so, delete it
  const remainingCheck = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM event_team_members WHERE event_team_id = $1`,
    [teamId],
  );
  const teamDeleted = parseInt(remainingCheck.rows[0].count, 10) === 0;
  if (teamDeleted) {
    await pool.query(`DELETE FROM event_teams WHERE id = $1`, [teamId]);
  }

  return { ok: true, team_deleted: teamDeleted };
}

// ---------------------------------------------------------------------------
// Stage-scoped team functions (T-020)
// ---------------------------------------------------------------------------

export async function listStageTeams(
  eventId: number,
  stageId: number,
  userId?: number,
): Promise<TeamResponse[]> {
  let result;
  if (userId !== undefined) {
    result = await pool.query<TeamRow>(
      `SELECT DISTINCT et.*
       FROM event_teams et
       JOIN event_team_members etm ON etm.event_team_id = et.id
       WHERE et.event_id = $1 AND et.stage_id = $2 AND etm.user_id = $3
       ORDER BY et.id`,
      [eventId, stageId, userId],
    );
  } else {
    result = await pool.query<TeamRow>(
      `SELECT * FROM event_teams WHERE event_id = $1 AND stage_id = $2 ORDER BY id`,
      [eventId, stageId],
    );
  }
  return attachMembers(result.rows);
}

export async function createStageTeam(
  eventId: number,
  stageId: number,
  initiatorId: number,
  inviteUserIds: number[],
  allowedTeamSizes: number[],
  eventMeta: EventMetaForRegistration,
): Promise<CreateTeamResult> {
  const allMemberIds = [initiatorId, ...inviteUserIds];
  const teamSize = allMemberIds.length;

  if (!allowedTeamSizes.includes(teamSize)) {
    return { ok: false, reason: 'invalid_size' };
  }

  // Check registration cutoff before opening a transaction
  const now = new Date();
  if (
    eventMeta.registration_cutoff !== null &&
    now > eventMeta.registration_cutoff &&
    !eventMeta.allow_late_registration
  ) {
    return { ok: false, reason: 'registration_closed' };
  }

  // No member may already be on a confirmed team for this specific stage
  const existingCheck = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM event_team_members etm
     JOIN event_teams et ON et.id = etm.event_team_id
     WHERE et.stage_id = $1 AND etm.user_id = ANY($2) AND etm.confirmed = TRUE`,
    [stageId, allMemberIds],
  );
  if (parseInt(existingCheck.rows[0].count, 10) > 0) {
    return { ok: false, reason: 'already_on_team' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Auto-register all members — team creation is the registration act
    for (const uid of allMemberIds) {
      await client.query(
        `INSERT INTO event_registrations (event_id, user_id, status)
         VALUES ($1, $2, 'ACTIVE')
         ON CONFLICT (event_id, user_id) DO UPDATE
           SET status = CASE
             WHEN event_registrations.status = 'WITHDRAWN' THEN 'ACTIVE'
             ELSE event_registrations.status
           END`,
        [eventId, uid],
      );
    }

    const teamResult = await client.query<{ id: number }>(
      `INSERT INTO event_teams (event_id, stage_id, team_size, source)
       VALUES ($1, $2, $3, 'REGISTERED')
       RETURNING id`,
      [eventId, stageId, teamSize],
    );
    const teamId = teamResult.rows[0].id;

    for (const uid of allMemberIds) {
      await client.query(
        `INSERT INTO event_team_members (event_team_id, user_id, confirmed)
         VALUES ($1, $2, $3)`,
        [teamId, uid, uid === initiatorId],
      );
    }

    await client.query('COMMIT');

    const team = await getTeam(teamId, eventId);
    return { ok: true, team: team! };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
