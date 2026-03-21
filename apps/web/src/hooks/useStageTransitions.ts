import { useEffect, useState } from 'react';
import { getJsonAuth, ApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export type FilterType = 'ALL' | 'TOP_N' | 'THRESHOLD' | 'MANUAL';
export type SeedingMethod = 'PRESERVE' | 'RANKED' | 'RANDOM' | 'MANUAL';

export type StageTransition = {
  id: number;
  event_id: number;
  after_stage_id: number | null;
  after_group_id: number | null;
  filter_type: FilterType;
  filter_value: number | null;
  seeding_method: SeedingMethod;
};

type State = {
  transitions: StageTransition[];
  loading: boolean;
  error: string | null;
};

export function useStageTransitions(eventSlug: string | undefined) {
  const { token } = useAuth();
  const [state, setState] = useState<State>({ transitions: [], loading: true, error: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!eventSlug || !token) return;
    let cancelled = false;

    async function load() {
      setState((prev) => ({ ...prev, loading: prev.transitions.length === 0, error: null }));
      try {
        const data = await getJsonAuth<StageTransition[]>(
          `/events/${encodeURIComponent(eventSlug!)}/transitions`,
          token as string,
        );
        if (!cancelled) setState({ transitions: data, loading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        setState({
          transitions: [],
          loading: false,
          error: err instanceof ApiError ? 'Failed to load transitions.' : 'Unexpected error',
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [eventSlug, token, version]);

  const refetch = () => setVersion((v) => v + 1);

  const upsertTransition = (t: StageTransition) =>
    setState((prev) => ({
      ...prev,
      transitions: prev.transitions.some((x) => x.id === t.id)
        ? prev.transitions.map((x) => (x.id === t.id ? t : x))
        : [...prev.transitions, t],
    }));

  const removeTransition = (id: number) =>
    setState((prev) => ({
      ...prev,
      transitions: prev.transitions.filter((t) => t.id !== id),
    }));

  return { ...state, refetch, upsertTransition, removeTransition };
}
