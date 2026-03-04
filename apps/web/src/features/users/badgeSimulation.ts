import type { UserBadgeRecord } from './userApi';
import { buildBadgePreviewSvg } from '../../pages/admin/badgeSvgRenderer';

const SHAPES = ['circle', 'rounded-square', 'rounded-hexagon', 'diamond-facet', 'rosette'] as const;
type TierKey = 'gold' | 'silver' | 'bronze' | 'participant';

const DEFAULT_TIER_CONFIG = {
  gold: { included: true, size: 'large' as const },
  silver: { included: true, size: 'large' as const },
  bronze: { included: true, size: 'large' as const },
  participant: { included: true, size: 'small' as const },
};

function rankToTier(rank: UserBadgeRecord['rank']): TierKey {
  if (rank === '1') return 'gold';
  if (rank === '2') return 'silver';
  if (rank === '3') return 'bronze';
  return 'participant';
}

function rankToSecondary(rank: UserBadgeRecord['rank']): string {
  if (rank === '1') return '{Winner,Winner,Winner,Participant}';
  if (rank === '2') return '{Finalist,Finalist,Finalist,Participant}';
  if (rank === '3') return '{Semi-Finalist,Semi-Finalist,Semi-Finalist,Participant}';
  if (rank === 'completion') return '{Completed,Completed,Completed,Participant}';
  return '{Participant,Participant,Participant,Participant}';
}

function rankToSymbol(rank: UserBadgeRecord['rank']): string {
  if (rank === '1') return 'emoji_events';
  if (rank === '2') return 'workspace_premium';
  if (rank === '3') return 'military_tech';
  if (rank === 'completion') return 'verified';
  return 'star';
}

function compactMainText(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'EVENT';
  const words = trimmed.split(/\s+/).slice(0, 4);
  if (words.length <= 2) return words.join(' ').toUpperCase();
  const midpoint = Math.ceil(words.length / 2);
  return `${words.slice(0, midpoint).join(' ').toUpperCase()}\n${words.slice(midpoint).join(' ').toUpperCase()}`;
}

function pickShapeKey(badge: UserBadgeRecord): (typeof SHAPES)[number] {
  const idx = Math.abs((badge.event_id * 31 + badge.id * 17) % SHAPES.length);
  return SHAPES[idx];
}

export function buildSimulatedBadgeSvg(badge: UserBadgeRecord): string {
  return buildBadgePreviewSvg({
    shape: pickShapeKey(badge),
    symbol: rankToSymbol(badge.rank),
    mainText: compactMainText(badge.event_name),
    secondaryText: rankToSecondary(badge.rank),
    tierConfig: DEFAULT_TIER_CONFIG,
    tierOverride: rankToTier(badge.rank),
  });
}

export function buildSimulatedBadgeDataUri(badge: UserBadgeRecord): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(buildSimulatedBadgeSvg(badge))}`;
}
