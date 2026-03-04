import { deleteJsonAuth, getJsonAuth, postJsonAuth, putJsonAuth } from '../../lib/api';

export type BadgeTierKey = 'gold' | 'silver' | 'bronze' | 'participant';
export type BadgeTierSize = 'small' | 'large';
export type BadgeTierConfig = Record<BadgeTierKey, { included: boolean; size: BadgeTierSize }>;

export type BadgeSetShape =
  | 'circle'
  | 'rounded-square'
  | 'rounded-hexagon'
  | 'diamond-facet'
  | 'rosette';

export type BadgeSetAttachment = {
  event_id: number;
  event_slug: string;
  event_name: string;
  event_published: boolean;
  purpose: 'season_overall' | 'session_winner' | 'challenge_overall';
  sort_order: number;
};

export type BadgeSetRecord = {
  id: number;
  name: string;
  shape: BadgeSetShape;
  symbol: string;
  icon_path: string | null;
  main_text: string;
  secondary_text: string;
  preview_svg: string;
  tier_config_json: BadgeTierConfig;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
  attachments: BadgeSetAttachment[];
};

export async function listBadgeSetsAuth(token: string): Promise<BadgeSetRecord[]> {
  const data = await getJsonAuth<{ sets: BadgeSetRecord[] }>('/badge-sets', token);
  return (data.sets ?? []).map((set) => ({
    ...set,
    attachments: Array.isArray(set.attachments) ? set.attachments : [],
  }));
}

export async function getBadgeSetByIdAuth(token: string, id: number): Promise<BadgeSetRecord> {
  return getJsonAuth<BadgeSetRecord>(`/badge-sets/${id}`, token);
}

export async function createBadgeSetAuth(
  token: string,
  payload: {
    name: string;
    shape: BadgeSetShape;
    symbol: string;
    icon_path?: string | null;
    main_text: string;
    secondary_text: string;
    preview_svg: string;
    tier_config_json: BadgeTierConfig;
  },
): Promise<BadgeSetRecord> {
  return postJsonAuth<BadgeSetRecord>('/badge-sets', token, payload);
}

export async function updateBadgeSetAuth(
  token: string,
  id: number,
  payload: Partial<{
    name: string;
    shape: BadgeSetShape;
    symbol: string;
    icon_path: string | null;
    main_text: string;
    secondary_text: string;
    preview_svg: string;
    tier_config_json: BadgeTierConfig;
  }>,
): Promise<BadgeSetRecord> {
  return putJsonAuth<BadgeSetRecord>(`/badge-sets/${id}`, token, payload);
}

export async function deleteBadgeSetAuth(token: string, id: number): Promise<void> {
  await deleteJsonAuth<unknown>(`/badge-sets/${id}`, token);
}

export async function listEventBadgeLinksAuth(
  token: string,
  slug: string,
): Promise<
  Array<{
    id: number;
    event_id: number;
    badge_set_id: number;
    purpose: 'season_overall' | 'session_winner' | 'challenge_overall';
    sort_order: number;
    created_at: string;
  }>
> {
  const data = await getJsonAuth<{
    links: Array<{
      id: number;
      event_id: number;
      badge_set_id: number;
      purpose: 'season_overall' | 'session_winner' | 'challenge_overall';
      sort_order: number;
      created_at: string;
    }>;
  }>(`/events/${encodeURIComponent(slug)}/badge-links`, token);
  return data.links;
}

export async function replaceEventBadgeLinksAuth(
  token: string,
  slug: string,
  links: Array<{
    badge_set_id: number;
    purpose: 'season_overall' | 'session_winner' | 'challenge_overall';
    sort_order?: number;
  }>,
): Promise<void> {
  await putJsonAuth<unknown>(`/events/${encodeURIComponent(slug)}/badge-links`, token, { links });
}

export type ChallengeBadgeConfig = {
  podium_enabled: boolean;
  completion_enabled: boolean;
  completion_requires_deadline: boolean;
};

export async function getChallengeBadgeConfigAuth(
  token: string,
  slug: string,
): Promise<ChallengeBadgeConfig> {
  return getJsonAuth<ChallengeBadgeConfig>(
    `/events/${encodeURIComponent(slug)}/challenge-badge-config`,
    token,
  );
}

export async function updateChallengeBadgeConfigAuth(
  token: string,
  slug: string,
  config: ChallengeBadgeConfig,
): Promise<ChallengeBadgeConfig> {
  return putJsonAuth<ChallengeBadgeConfig>(
    `/events/${encodeURIComponent(slug)}/challenge-badge-config`,
    token,
    config,
  );
}
