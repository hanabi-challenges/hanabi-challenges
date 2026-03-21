import { useEffect, useState } from 'react';
import { getJsonAuth, ApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export type GroupTemplate = {
  label_pattern?: string;
  mechanism?: string;
  participation_type?: string;
  team_scope?: string;
  attempt_policy?: string;
  time_policy?: string;
  game_count?: number;
  variant_rule_json?: { type: 'specific'; variantId: number } | { type: 'none' } | null;
  seed_rule_json?: { formula: string } | null;
};

export type StageGroup = {
  id: number;
  event_id: number;
  label: string;
  group_index: number;
  scoring_config_json: Record<string, unknown>;
  template_json: GroupTemplate | null;
  visible: boolean;
  stage_count: number;
};

type State = {
  groups: StageGroup[];
  loading: boolean;
  error: string | null;
};

export function useStageGroups(eventSlug: string | undefined) {
  const { token } = useAuth();
  const [state, setState] = useState<State>({ groups: [], loading: true, error: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!eventSlug || !token) return;
    let cancelled = false;

    async function fetchGroups() {
      // Only show the loading skeleton on the initial empty load
      setState((prev) => ({ ...prev, loading: prev.groups.length === 0, error: null }));
      try {
        const data = await getJsonAuth<StageGroup[]>(
          `/events/${encodeURIComponent(eventSlug!)}/stage-groups`,
          token as string,
        );
        if (!cancelled) setState({ groups: data, loading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        setState({
          groups: [],
          loading: false,
          error: err instanceof ApiError ? 'Failed to load groups.' : 'Unexpected error',
        });
      }
    }

    fetchGroups();
    return () => {
      cancelled = true;
    };
  }, [eventSlug, token, version]);

  const refetch = () => setVersion((v) => v + 1);

  const patchGroup = (id: number, patch: Partial<StageGroup>) =>
    setState((prev) => ({
      ...prev,
      groups: prev.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    }));

  const removeGroup = (id: number) =>
    setState((prev) => ({ ...prev, groups: prev.groups.filter((g) => g.id !== id) }));

  const appendGroup = (group: StageGroup) =>
    setState((prev) => ({ ...prev, groups: [...prev.groups, group] }));

  return { ...state, refetch, patchGroup, removeGroup, appendGroup };
}
