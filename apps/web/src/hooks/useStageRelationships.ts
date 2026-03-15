import { useEffect, useState } from 'react';
import { getJsonAuth, ApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export type FilterType = 'ALL' | 'TOP_N' | 'THRESHOLD' | 'MANUAL';
export type SeedingMethod = 'RANKED' | 'RANDOM' | 'MANUAL';

export type StageRelationship = {
  id: number;
  source_stage_id: number;
  target_stage_id: number;
  filter_type: FilterType;
  filter_value: number | null;
  seeding_method: SeedingMethod;
};

type State = {
  relationships: StageRelationship[];
  loading: boolean;
  error: string | null;
};

export function useStageRelationships(eventSlug: string | undefined) {
  const { token } = useAuth();
  const [state, setState] = useState<State>({ relationships: [], loading: true, error: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!eventSlug || !token) return;
    let cancelled = false;

    async function fetch() {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const data = await getJsonAuth<StageRelationship[]>(
          `/events/${encodeURIComponent(eventSlug!)}/stage-relationships`,
          token as string,
        );
        if (!cancelled) setState({ relationships: data, loading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        setState({
          relationships: [],
          loading: false,
          error: err instanceof ApiError ? 'Failed to load relationships.' : 'Unexpected error',
        });
      }
    }

    fetch();
    return () => {
      cancelled = true;
    };
  }, [eventSlug, token, version]);

  const refetch = () => setVersion((v) => v + 1);
  return { ...state, refetch };
}
