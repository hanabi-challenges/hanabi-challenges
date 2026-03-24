import { useEffect, useState } from 'react';
import { getJsonAuth, ApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export type StageSummary = {
  id: number;
  event_id: number;
  label: string;
  stage_index: number;
  group_id: number | null;
  mechanism: 'SEEDED_LEADERBOARD' | 'GAUNTLET' | 'MATCH_PLAY';
  participation_type: 'INDIVIDUAL' | 'TEAM';
  team_scope: 'EVENT' | 'STAGE';
  attempt_policy: 'SINGLE' | 'REQUIRED_ALL' | 'BEST_OF_N' | 'UNLIMITED_BEST';
  time_policy: 'WINDOW' | 'ROLLING' | 'SCHEDULED';
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  visible: boolean;
  config_json: Record<string, unknown>;
  game_scoring_config_json: Record<string, unknown>;
  stage_scoring_config_json: Record<string, unknown>;
  variant_rule_json: Record<string, unknown> | null;
  seed_rule_json: Record<string, unknown> | null;
  auto_pull_json: { enabled: boolean; interval_minutes: number } | null;
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
      // Only show the loading skeleton on the initial empty load
      setState((prev) => ({ ...prev, loading: prev.stages.length === 0, error: null }));
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

  const patchStage = (id: number, patch: Partial<StageSummary>) =>
    setState((prev) => ({
      ...prev,
      stages: prev.stages.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));

  const removeStage = (id: number) =>
    setState((prev) => ({ ...prev, stages: prev.stages.filter((s) => s.id !== id) }));

  const appendStage = (stage: StageSummary) =>
    setState((prev) => ({ ...prev, stages: [...prev.stages, stage] }));

  return { ...state, refetch, patchStage, removeStage, appendStage };
}
