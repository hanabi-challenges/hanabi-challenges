/** Role slugs — must match roles seed data. */
export type RoleSlug = 'community_member' | 'moderator' | 'committee';

/** Account status values — must match users.account_status check constraint. */
export type AccountStatus = 'active' | 'restricted' | 'banned';

/** Assignment source — must match user_role_assignments.source check constraint. */
export type AssignmentSource = 'manual' | 'discord_sync';

/** A tracker user as resolved by the auth middleware. */
export interface TrackerUser {
  id: string;
  hanablive_username: string;
  display_name: string;
  account_status: AccountStatus;
  role: RoleSlug;
}

/** Request body for assigning a role to a user. */
export interface AssignRoleRequest {
  role: RoleSlug;
}

/** Response body for a role assignment or revocation. */
export interface AssignRoleResponse {
  user_id: string;
  role: RoleSlug;
}
