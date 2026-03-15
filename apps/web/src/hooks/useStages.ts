import { useEffect, useState } from 'react';
import { getJsonAuth, ApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export type StageSummary = {
  id: number;
  event_id: number;
  label: string;
  stage_index: number;
  mechanism: 'SEEDED_LEADERBOARD' | 'GAUNTLET' | 'MATCH_PLAY';
  team_policy: 'SELF_FORMED' | 'QUEUED';
  team_scope: 'EVENT' | 'STAGE';
  attempt_policy: 'SINGLE' | 'REQUIRED_ALL' | 'BEST_OF_N' | 'UNLIMITED_BEST';
  time_policy: 'WINDOW' | 'ROLLING' | 'SCHEDULED';
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  config_json: Record<string, unknown>;
  game_scoring_config_json: Record<string, unknown>;
  stage_scoring_config_json: Record<string, unknown>;
  variant_rule_json: Record<string, unknown> | null;
  seed_rule_json: Record<string, unknown> | null;
  game_slot_count: number;
  team_count: number;
};

type State = {
  stages: StageSummary[];
  loading: boolean;
  error: string | null;
};

export function useStages(eventSlug: string | undefined) {
  const { token } = useAuth();
  const [state, setState] = useState<State>({ stages: [], loading: true, error: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!eventSlug || !token) return;
    let cancelled = false;

    async function fetchStages() {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const data = await getJsonAuth<StageSummary[]>(
          `/events/${encodeURIComponent(eventSlug!)}/stages`,
          token as string,
        );
        if (!cancelled) setState({ stages: data, loading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        setState({
          stages: [],
          loading: false,
          error: err instanceof ApiError ? 'Failed to load stages.' : 'Unexpected error',
        });
      }
    }

    fetchStages();
    return () => {
      cancelled = true;
    };
  }, [eventSlug, token, version]);

  const refetch = () => setVersion((v) => v + 1);
  return { ...state, refetch };
}
