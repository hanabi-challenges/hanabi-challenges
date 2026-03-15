import { describe, expect, it } from 'vitest';
import {
  inferStageStatus,
  inferEventStatus,
  inferEventDates,
  type StageForStatus,
  type EventForStatus,
} from '../../../src/utils/status.utils';

const now = new Date('2026-03-15T12:00:00Z');
const past = (d: string) => new Date(d);
const future = (d: string) => new Date(d);

// --- inferStageStatus ---

describe('inferStageStatus', () => {
  it('returns ANNOUNCED when starts_at is null', () => {
    const stage: StageForStatus = { time_policy: 'WINDOW', starts_at: null, ends_at: null };
    expect(inferStageStatus(stage, now)).toBe('ANNOUNCED');
  });

  it('returns UPCOMING when starts_at is in the future', () => {
    const stage: StageForStatus = {
      time_policy: 'WINDOW',
      starts_at: future('2026-04-01T00:00:00Z'),
      ends_at: future('2026-05-01T00:00:00Z'),
    };
    expect(inferStageStatus(stage, now)).toBe('UPCOMING');
  });

  it('returns IN_PROGRESS for a WINDOW stage that is currently active', () => {
    const stage: StageForStatus = {
      time_policy: 'WINDOW',
      starts_at: past('2026-03-01T00:00:00Z'),
      ends_at: future('2026-04-01T00:00:00Z'),
    };
    expect(inferStageStatus(stage, now)).toBe('IN_PROGRESS');
  });

  it('returns IN_PROGRESS for a ROLLING stage that is currently active', () => {
    const stage: StageForStatus = {
      time_policy: 'ROLLING',
      starts_at: past('2026-03-01T00:00:00Z'),
      ends_at: future('2026-04-01T00:00:00Z'),
    };
    expect(inferStageStatus(stage, now)).toBe('IN_PROGRESS');
  });

  it('returns LIVE for a SCHEDULED stage that is currently active', () => {
    const stage: StageForStatus = {
      time_policy: 'SCHEDULED',
      starts_at: past('2026-03-15T11:00:00Z'),
      ends_at: future('2026-03-15T14:00:00Z'),
    };
    expect(inferStageStatus(stage, now)).toBe('LIVE');
  });

  it('returns COMPLETE when ends_at is in the past', () => {
    const stage: StageForStatus = {
      time_policy: 'WINDOW',
      starts_at: past('2026-01-01T00:00:00Z'),
      ends_at: past('2026-02-01T00:00:00Z'),
    };
    expect(inferStageStatus(stage, now)).toBe('COMPLETE');
  });

  it('returns COMPLETE for a SCHEDULED stage whose end has passed', () => {
    const stage: StageForStatus = {
      time_policy: 'SCHEDULED',
      starts_at: past('2026-03-15T09:00:00Z'),
      ends_at: past('2026-03-15T11:00:00Z'),
    };
    expect(inferStageStatus(stage, now)).toBe('COMPLETE');
  });

  it('handles a stage with starts_at set but no ends_at', () => {
    const stage: StageForStatus = {
      time_policy: 'WINDOW',
      starts_at: past('2026-03-01T00:00:00Z'),
      ends_at: null,
    };
    expect(inferStageStatus(stage, now)).toBe('IN_PROGRESS');
  });

  it('COMPLETE takes precedence over active window when ends_at is exactly now', () => {
    const stage: StageForStatus = {
      time_policy: 'WINDOW',
      starts_at: past('2026-03-01T00:00:00Z'),
      ends_at: now,
    };
    expect(inferStageStatus(stage, now)).toBe('COMPLETE');
  });
});

// --- inferEventDates ---

describe('inferEventDates', () => {
  it('returns nulls when there are no stages', () => {
    expect(inferEventDates([])).toEqual({ startsAt: null, endsAt: null });
  });

  it('returns the MIN starts_at and MAX ends_at', () => {
    const stages: StageForStatus[] = [
      {
        time_policy: 'WINDOW',
        starts_at: new Date('2026-02-01T00:00:00Z'),
        ends_at: new Date('2026-04-01T00:00:00Z'),
      },
      {
        time_policy: 'WINDOW',
        starts_at: new Date('2026-01-01T00:00:00Z'),
        ends_at: new Date('2026-03-01T00:00:00Z'),
      },
    ];
    const result = inferEventDates(stages);
    expect(result.startsAt).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(result.endsAt).toEqual(new Date('2026-04-01T00:00:00Z'));
  });

  it('ignores null dates', () => {
    const stages: StageForStatus[] = [
      { time_policy: 'WINDOW', starts_at: new Date('2026-03-01T00:00:00Z'), ends_at: null },
      { time_policy: 'WINDOW', starts_at: null, ends_at: new Date('2026-05-01T00:00:00Z') },
    ];
    const result = inferEventDates(stages);
    expect(result.startsAt).toEqual(new Date('2026-03-01T00:00:00Z'));
    expect(result.endsAt).toEqual(new Date('2026-05-01T00:00:00Z'));
  });
});

// --- inferEventStatus ---

describe('inferEventStatus', () => {
  const noRegistration: EventForStatus = {
    registration_opens_at: null,
    registration_cutoff: null,
  };

  it('returns ANNOUNCED when no stages and no registration dates', () => {
    expect(inferEventStatus(noRegistration, [], now)).toBe('ANNOUNCED');
  });

  it('returns REGISTRATION_OPEN when within the registration window', () => {
    const event: EventForStatus = {
      registration_opens_at: past('2026-03-01T00:00:00Z'),
      registration_cutoff: future('2026-04-01T00:00:00Z'),
    };
    expect(inferEventStatus(event, [], now)).toBe('REGISTRATION_OPEN');
  });

  it('returns UPCOMING when registration has closed and no stage is active', () => {
    const event: EventForStatus = {
      registration_opens_at: past('2026-01-01T00:00:00Z'),
      registration_cutoff: past('2026-02-01T00:00:00Z'),
    };
    const stages: StageForStatus[] = [
      {
        time_policy: 'WINDOW',
        starts_at: future('2026-04-01T00:00:00Z'),
        ends_at: future('2026-05-01T00:00:00Z'),
      },
    ];
    expect(inferEventStatus(event, stages, now)).toBe('UPCOMING');
  });

  it('returns IN_PROGRESS when a WINDOW stage is active', () => {
    const stages: StageForStatus[] = [
      {
        time_policy: 'WINDOW',
        starts_at: past('2026-03-01T00:00:00Z'),
        ends_at: future('2026-04-01T00:00:00Z'),
      },
    ];
    expect(inferEventStatus(noRegistration, stages, now)).toBe('IN_PROGRESS');
  });

  it('returns LIVE when a SCHEDULED stage is active', () => {
    const stages: StageForStatus[] = [
      {
        time_policy: 'SCHEDULED',
        starts_at: past('2026-03-15T11:00:00Z'),
        ends_at: future('2026-03-15T14:00:00Z'),
      },
    ];
    expect(inferEventStatus(noRegistration, stages, now)).toBe('LIVE');
  });

  it('LIVE takes precedence over IN_PROGRESS when both conditions hold', () => {
    const stages: StageForStatus[] = [
      {
        time_policy: 'WINDOW',
        starts_at: past('2026-03-01T00:00:00Z'),
        ends_at: future('2026-04-01T00:00:00Z'),
      },
      {
        time_policy: 'SCHEDULED',
        starts_at: past('2026-03-15T11:00:00Z'),
        ends_at: future('2026-03-15T14:00:00Z'),
      },
    ];
    expect(inferEventStatus(noRegistration, stages, now)).toBe('LIVE');
  });

  it('returns COMPLETE when all stages are complete', () => {
    const stages: StageForStatus[] = [
      {
        time_policy: 'WINDOW',
        starts_at: past('2026-01-01T00:00:00Z'),
        ends_at: past('2026-02-01T00:00:00Z'),
      },
      {
        time_policy: 'WINDOW',
        starts_at: past('2026-02-01T00:00:00Z'),
        ends_at: past('2026-03-01T00:00:00Z'),
      },
    ];
    expect(inferEventStatus(noRegistration, stages, now)).toBe('COMPLETE');
  });

  it('does not return COMPLETE when no stages exist', () => {
    expect(inferEventStatus(noRegistration, [], now)).toBe('ANNOUNCED');
  });

  it('returns IN_PROGRESS even if registration cutoff has passed', () => {
    const event: EventForStatus = {
      registration_opens_at: past('2026-01-01T00:00:00Z'),
      registration_cutoff: past('2026-02-01T00:00:00Z'),
    };
    const stages: StageForStatus[] = [
      {
        time_policy: 'WINDOW',
        starts_at: past('2026-03-01T00:00:00Z'),
        ends_at: future('2026-04-01T00:00:00Z'),
      },
    ];
    expect(inferEventStatus(event, stages, now)).toBe('IN_PROGRESS');
  });
});
