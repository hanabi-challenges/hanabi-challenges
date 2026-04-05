import type { BadgeTone } from '../../design-system';
import type { StatusSlug } from './types';

export interface StatusMeta {
  label: string;
  tone: BadgeTone;
}

export const STATUS_CONFIG: Record<StatusSlug, StatusMeta> = {
  submitted: { label: 'Submitted', tone: 'neutral' },
  triaged: { label: 'Triaged', tone: 'info' },
  in_review: { label: 'In Review', tone: 'info' },
  in_progress: { label: 'In Progress', tone: 'info' },
  decided: { label: 'Decided', tone: 'warning' },
  resolved: { label: 'Resolved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  closed: { label: 'Closed', tone: 'neutral' },
};

export const TYPE_LABELS: Record<string, string> = {
  bug: 'Bug',
  feature_request: 'Feature Request',
  question: 'Question',
  feedback: 'Feedback',
  other: 'Other',
};

export const DOMAIN_LABELS: Record<string, string> = {
  gameplay: 'Gameplay',
  scoring: 'Scoring',
  registration: 'Registration',
  interface: 'Interface',
  matchmaking: 'Matchmaking',
  events: 'Events',
  discord: 'Discord',
  other: 'Other',
};

export const SEVERITY_LABELS: Record<string, string> = {
  cosmetic: 'Cosmetic',
  functional: 'Functional',
  blocking: 'Blocking',
};

export const REPRODUCIBILITY_LABELS: Record<string, string> = {
  always: 'Always',
  sometimes: 'Sometimes',
  once: 'Once',
};

// Valid next statuses by role. Committee can do everything; moderators cannot act from in_review.
const MODERATOR_TRANSITIONS: Record<StatusSlug, StatusSlug[]> = {
  submitted: ['triaged', 'rejected', 'closed'],
  triaged: ['in_review', 'rejected', 'closed'],
  in_review: [],
  in_progress: ['resolved', 'rejected', 'closed'],
  decided: ['in_progress', 'resolved', 'rejected', 'closed'],
  resolved: [],
  rejected: [],
  closed: [],
};

const COMMITTEE_TRANSITIONS: Record<StatusSlug, StatusSlug[]> = {
  submitted: ['triaged', 'rejected', 'closed'],
  triaged: ['in_review', 'rejected', 'closed'],
  in_review: ['decided', 'rejected', 'closed'],
  in_progress: ['resolved', 'rejected', 'closed'],
  decided: ['in_progress', 'resolved', 'rejected', 'closed'],
  resolved: [],
  rejected: [],
  closed: [],
};

/** Returns valid next statuses for a given current status, based on main-app roles. */
export function getValidNextStatuses(current: StatusSlug, roles: string[]): StatusSlug[] {
  const isCommittee = roles.includes('SUPERADMIN') || roles.includes('SITE_ADMIN');
  if (isCommittee) return COMMITTEE_TRANSITIONS[current];
  if (roles.includes('MOD')) return MODERATOR_TRANSITIONS[current];
  return [];
}
