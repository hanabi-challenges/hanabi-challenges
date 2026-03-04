import { useEffect, useState, useCallback } from 'react';
import { ApiError, getJson } from '../lib/api';

export type EventTeam = {
  id: number;
  event_id: number;
  name: string;
  created_at: string;
  team_size: number;
  owner_user_id?: number | null;
  completed_games?: number | null;
  perfect_games?: number | null;
  avg_bdr?: number | null;
  avg_score?: number | null;
  total_templates?: number | null;
};

type State = {
  teams: EventTeam[];
  loading: boolean;
  error: string | null;
};

export function useEventTeams(slug: string | undefined) {
  const [state, setState] = useState<State>(() =>
    !slug
      ? { teams: [], loading: false, error: 'No event specified' }
      : { teams: [], loading: true, error: null },
  );

  const fetchTeams = useCallback(async () => {
    if (!slug) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const encodedSlug = encodeURIComponent(slug);
      const data = await getJson<EventTeam[]>(`/events/${encodedSlug}/teams`);
      setState({ teams: data, loading: false, error: null });
    } catch (err) {
      const message =
        err instanceof ApiError ? 'Failed to load teams. Please try again.' : 'Unexpected error';

      console.error('Failed to load event teams', err);
      setState({ teams: [], loading: false, error: message });
    }
  }, [slug]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  return { ...state, refetch: fetchTeams };
}
