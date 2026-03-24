import { getJson } from '../../lib/api';

export type UserProfileRecord = {
  id: number;
  display_name: string;
  role: string;
  color_hex: string;
  text_color: string;
  created_at: string;
};

export type UserEventRecord = {
  event_team_id: number;
  team_name: string;
  team_size: number;
  event_id: number;
  event_name: string;
  event_slug: string;
  short_description: string | null;
  long_description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  registration_opens_at: string | null;
  registration_cutoff: string | null;
  allow_late_registration: boolean;
};

export type UserBadgeRecord = {
  id: number;
  event_badge_id: number;
  event_id: number;
  event_name: string;
  event_slug: string;
  team_id: number | null;
  team_name: string | null;
  team_size: number;
  name: string;
  description: string;
  icon: string;
  rank: '1' | '2' | '3' | 'completion' | 'participation';
  awarded_at: string | null;
};

export async function fetchUserProfile(username: string): Promise<UserProfileRecord> {
  return getJson<UserProfileRecord>(`/users/${encodeURIComponent(username)}`);
}

export async function fetchUserEvents(username: string): Promise<UserEventRecord[]> {
  return getJson<UserEventRecord[]>(`/users/${encodeURIComponent(username)}/events`);
}

export async function fetchUserBadges(username: string): Promise<UserBadgeRecord[]> {
  return getJson<UserBadgeRecord[]>(`/users/${encodeURIComponent(username)}/badges`);
}

export type UserAwardRecord = {
  id: number;
  award_id: number;
  event_id: number;
  event_name: string;
  event_slug: string;
  stage_id: number | null;
  stage_label: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  criteria_type: string;
  granted_at: string;
};

export async function fetchUserAwards(username: string): Promise<UserAwardRecord[]> {
  return getJson<UserAwardRecord[]>(`/users/${encodeURIComponent(username)}/awards`);
}

export function parseIconHex(icon: string): string {
  const parsed = Number.parseInt(icon, 16);
  if (Number.isNaN(parsed)) return '🏅';
  return String.fromCodePoint(parsed);
}

export function isLargeBadge(rank: UserBadgeRecord['rank']): boolean {
  return rank === '1' || rank === '2' || rank === '3';
}
