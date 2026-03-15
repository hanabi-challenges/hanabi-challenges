import type { EventStatus } from '../../utils/status.utils';

export type RegistrationMode = 'ACTIVE' | 'PASSIVE';

export type EventRow = {
  id: number;
  slug: string;
  name: string;
  short_description: string | null;
  long_description: string;
  published: boolean;
  registration_mode: RegistrationMode;
  allowed_team_sizes: number[];
  combined_leaderboard: boolean;
  variant_rule_json: unknown | null;
  seed_rule_json: unknown | null;
  aggregate_config_json: unknown | null;
  registration_opens_at: Date | null;
  registration_cutoff: Date | null;
  allow_late_registration: boolean;
  created_at: Date;
};

export type EventResponse = EventRow & {
  status: EventStatus;
  starts_at: Date | null;
  ends_at: Date | null;
  stage_count: number;
};

export type CreateEventBody = {
  slug: string;
  name: string;
  short_description?: string | null;
  long_description: string;
  registration_mode?: RegistrationMode;
  allowed_team_sizes: number[];
  combined_leaderboard?: boolean;
  variant_rule_json?: unknown;
  seed_rule_json?: unknown;
  aggregate_config_json?: unknown;
  registration_opens_at?: string | null;
  registration_cutoff?: string | null;
  allow_late_registration?: boolean;
};

export type UpdateEventBody = Partial<Omit<CreateEventBody, 'slug'>>;
