// Status inference utilities (T-011)
//
// Event and stage status are never stored — they are computed from stage
// dates and time_policy at query time.
//
// Stage status vocabulary:
//   ANNOUNCED        — stage exists but has not started; no start date set
//   UPCOMING         — start date is set and in the future
//   IN_PROGRESS      — WINDOW or ROLLING stage is currently active
//   LIVE             — SCHEDULED stage is currently active
//   COMPLETE         — end date is in the past
//
// Event status vocabulary (same labels, derived from stage statuses):
//   ANNOUNCED        — published; registration not yet open
//   REGISTRATION_OPEN — within the registration window
//   UPCOMING         — registration closed; no stage has started
//   IN_PROGRESS      — at least one WINDOW stage is active
//   LIVE             — at least one SCHEDULED stage is active (takes precedence)
//   COMPLETE         — all stages have ended

export type TimePolicy = 'WINDOW' | 'ROLLING' | 'SCHEDULED';

export type StageStatus = 'ANNOUNCED' | 'UPCOMING' | 'IN_PROGRESS' | 'LIVE' | 'COMPLETE';

export type EventStatus =
  | 'ANNOUNCED'
  | 'REGISTRATION_OPEN'
  | 'UPCOMING'
  | 'IN_PROGRESS'
  | 'LIVE'
  | 'COMPLETE';

export type StageForStatus = {
  time_policy: TimePolicy;
  starts_at: Date | null;
  ends_at: Date | null;
};

export type EventForStatus = {
  registration_opens_at: Date | null;
  registration_cutoff: Date | null;
};

export function inferStageStatus(stage: StageForStatus, now: Date): StageStatus {
  const { time_policy, starts_at, ends_at } = stage;

  if (ends_at !== null && ends_at <= now) return 'COMPLETE';

  if (starts_at !== null && starts_at <= now) {
    return time_policy === 'SCHEDULED' ? 'LIVE' : 'IN_PROGRESS';
  }

  if (starts_at !== null) return 'UPCOMING';

  return 'ANNOUNCED';
}

// Returns the MIN starts_at and MAX ends_at across all stages.
// null means no stages have that date set.
export function inferEventDates(stages: StageForStatus[]): {
  startsAt: Date | null;
  endsAt: Date | null;
} {
  const starts = stages.map((s) => s.starts_at).filter((d): d is Date => d !== null);
  const ends = stages.map((s) => s.ends_at).filter((d): d is Date => d !== null);

  return {
    startsAt: starts.length > 0 ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null,
    endsAt: ends.length > 0 ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null,
  };
}

export function inferEventStatus(
  event: EventForStatus,
  stages: StageForStatus[],
  now: Date,
): EventStatus {
  const stageStatuses = stages.map((s) => inferStageStatus(s, now));

  // COMPLETE: all stages exist and all are complete
  if (stages.length > 0 && stageStatuses.every((s) => s === 'COMPLETE')) return 'COMPLETE';

  // LIVE takes precedence over IN_PROGRESS
  if (stageStatuses.some((s) => s === 'LIVE')) return 'LIVE';

  if (stageStatuses.some((s) => s === 'IN_PROGRESS')) return 'IN_PROGRESS';

  // UPCOMING: registration window has closed, no stage is active yet
  if (event.registration_cutoff !== null && event.registration_cutoff <= now) return 'UPCOMING';

  // REGISTRATION_OPEN: within the registration window
  if (
    event.registration_opens_at !== null &&
    event.registration_opens_at <= now &&
    (event.registration_cutoff === null || event.registration_cutoff > now)
  ) {
    return 'REGISTRATION_OPEN';
  }

  return 'ANNOUNCED';
}
