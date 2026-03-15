export type StageMechanism = 'SEEDED_LEADERBOARD' | 'GAUNTLET' | 'MATCH_PLAY';
export type TeamPolicy = 'SELF_FORMED' | 'QUEUED';
export type TeamScope = 'EVENT' | 'STAGE';
export type AttemptPolicy = 'SINGLE' | 'REQUIRED_ALL' | 'BEST_OF_N' | 'UNLIMITED_BEST';
export type TimePolicy = 'WINDOW' | 'ROLLING' | 'SCHEDULED';

export type StageRow = {
  id: number;
  event_id: number;
  label: string;
  stage_index: number;
  mechanism: StageMechanism;
  team_policy: TeamPolicy;
  team_scope: TeamScope;
  attempt_policy: AttemptPolicy;
  time_policy: TimePolicy;
  game_scoring_config_json: Record<string, unknown>;
  stage_scoring_config_json: Record<string, unknown>;
  variant_rule_json: Record<string, unknown> | null;
  seed_rule_json: Record<string, unknown> | null;
  config_json: Record<string, unknown>;
  starts_at: Date | null;
  ends_at: Date | null;
  created_at: Date;
};

export type StageResponse = StageRow & {
  status: string;
  game_slot_count: number;
  team_count: number;
};

export type CreateStageBody = {
  label: string;
  mechanism: StageMechanism;
  team_policy: TeamPolicy;
  team_scope: TeamScope;
  attempt_policy: AttemptPolicy;
  time_policy: TimePolicy;
  game_scoring_config_json?: Record<string, unknown>;
  stage_scoring_config_json?: Record<string, unknown>;
  variant_rule_json?: Record<string, unknown> | null;
  seed_rule_json?: Record<string, unknown> | null;
  config_json?: Record<string, unknown>;
  starts_at?: string | null;
  ends_at?: string | null;
};

export type UpdateStageBody = Partial<Omit<CreateStageBody, 'mechanism'>>;
