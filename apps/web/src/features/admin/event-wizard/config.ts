export type StepKey = 'type' | 'event' | 'badges' | 'registration' | 'stage' | 'templates';

export const steps: { key: StepKey; label: string }[] = [
  { key: 'type', label: 'Event Type' },
  { key: 'event', label: 'Event Info' },
  { key: 'registration', label: 'Registration' },
  { key: 'stage', label: 'Stage' },
  { key: 'templates', label: 'Templates' },
  { key: 'badges', label: 'Badges' },
];

export type EventTypeLabel = 'Challenge' | 'Tournament' | 'League';

const longDescriptionTemplates: Record<EventTypeLabel, string> = {
  Challenge: `## Overview
Describe the goal of this challenge event, who it is for, and what participants should expect.

## Format
All teams play the same fixed set of seeds and compare results on a shared leaderboard.

## Schedule
Add event start/end timing and any key deadlines here.

## Scoring
Explain how scores are calculated, how standings are ordered, and how ties are handled.

## FAQ / Contact
Add any frequently asked questions and where players should ask for help.`,
  Tournament: `## Overview
Describe the tournament at a high level and what type of competition participants should expect.

## Format
Define the tournament structure here (for example: group stage, bracket, round robin, elimination rules).

## Schedule
Add event start/end timing and any key deadlines here.

## Scoring
Explain how match outcomes are recorded and how standings/advancement are determined.

## FAQ / Contact
Add any frequently asked questions and where players should ask for help.`,
  League: `## Overview
Describe this ongoing session-based event and what players can expect each session.

## Format
Explain session flow, round flow, team assignment, and any participation expectations.

## Schedule
Add session cadence and timing expectations (for example: weekly sessions).

## Scoring
Explain rating updates (including ELO changes), placement impact, and how overall standings are determined.

## FAQ / Contact
Add any frequently asked questions and where players should ask for help.`,
};

export function longDescriptionTemplateFor(eventType: EventTypeLabel) {
  return longDescriptionTemplates[eventType];
}

export type EventStage = {
  label: string;
  config_json: unknown;
  starts_at: string | null;
  ends_at: string | null;
  stage_type: 'SINGLE' | 'ROUND_ROBIN' | 'BRACKET' | 'GAUNTLET';
  event_stage_id?: number;
};

export type EventGameTemplate = {
  variant: string;
};

export type RoundPattern = {
  namePattern: string;
  abbrPattern: string;
  playDays: number;
  gapDays: number;
  gamesPerRound: string;
};

export type StageForm = {
  id?: number;
  label: string;
  abbr: string;
  gameCount: number;
  startsAt: string;
  endsAt: string;
  timeBound: boolean;
  stageType: 'SINGLE' | 'ROUND_ROBIN' | 'BRACKET' | 'GAUNTLET';
  roundPattern?: RoundPattern;
};

export type CreateEventWizardDraft = {
  name: string;
  eventType: EventTypeLabel;
  eventAbbr: string;
  slug: string;
  shortDescription: string;
  longDescription: string;
  startsAt: string;
  endsAt: string;
  published: boolean;
  seedingPlayEnabled: boolean;
  seedingFormat: 'round_robin' | 'groups' | '';
  maxTeams: string;
  stages: StageForm[];
  variant: string;
  seedCount: number;
  seedFormula: string;
  allowLateRegistration: boolean;
  registrationOpens: string;
  registrationCutoff: string;
  enforceExactTeamSize: boolean;
  challengeBadgeSetId: string | null;
  leagueSeasonBadgeSetId: string | null;
  leagueSessionBadgeSetId: string | null;
  currentStep: StepKey;
};

export const CREATE_EVENT_WIZARD_DRAFT_KEY = 'hanabi.admin.create-event.wizard.draft.v1';

export const defaultRoundPattern: RoundPattern = {
  namePattern: 'Round {i}',
  abbrPattern: 'R{i}',
  playDays: 7,
  gapDays: 0,
  gamesPerRound: '3,3,5,5,7,7',
};

export function normalizeRoundPattern(partial?: Partial<RoundPattern> | null): RoundPattern {
  if (!partial) return { ...defaultRoundPattern };
  return {
    namePattern: partial.namePattern ?? defaultRoundPattern.namePattern,
    abbrPattern: partial.abbrPattern ?? defaultRoundPattern.abbrPattern,
    playDays: partial.playDays ?? defaultRoundPattern.playDays,
    gapDays: partial.gapDays ?? defaultRoundPattern.gapDays,
    gamesPerRound: partial.gamesPerRound ?? defaultRoundPattern.gamesPerRound,
  };
}

export function initialStage(): StageForm {
  return {
    label: '',
    abbr: '',
    gameCount: 100,
    startsAt: '',
    endsAt: '',
    timeBound: true,
    stageType: 'SINGLE',
    roundPattern: { ...defaultRoundPattern },
  };
}

export function stagesEqual(a: StageForm, b: StageForm) {
  return (
    a.label === b.label &&
    a.abbr === b.abbr &&
    a.gameCount === b.gameCount &&
    a.startsAt === b.startsAt &&
    a.endsAt === b.endsAt &&
    a.timeBound === b.timeBound &&
    a.stageType === b.stageType &&
    JSON.stringify(a.roundPattern ?? null) === JSON.stringify(b.roundPattern ?? null)
  );
}
