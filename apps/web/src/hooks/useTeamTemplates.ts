import { useEffect, useState } from 'react';
import { ApiError, getJson, getJsonAuth } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export type TeamTemplate = {
  stage_index: number;
  stage_label: string;
  stage_type: string;
  stage_status?: string | null;
  template_id: number;
  template_index: number;
  variant: string;
  max_score: number | null;
  seed_payload: string | null;
  stats?: {
    games_played: number;
    perfect_games: number;
  };
  result: {
    id: number;
    score: number;
    zero_reason: string | null;
    bottom_deck_risk: number | null;
    notes: string | null;
    played_at: string;
    hanab_game_id: number | null;
    players?: { display_name: string; color_hex: string; text_color: string }[];
  } | null;
};

type State = {
  templates: TeamTemplate[];
  loading: boolean;
  error: string | null;
};

export function useTeamTemplates(
  teamId: number | null | undefined,
  options?: { enabled?: boolean },
) {
  const { token } = useAuth();
  const [state, setState] = useState<State>(() =>
    teamId == null
      ? { templates: [], loading: false, error: 'No team specified' }
      : { templates: [], loading: true, error: null },
  );

  useEffect(() => {
    if (teamId == null || options?.enabled === false) {
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }
    let cancelled = false;

    async function fetchTemplates() {
      setState({ templates: [], loading: true, error: null });
      try {
        const data = token
          ? await getJsonAuth<{ templates: TeamTemplate[] }>(
              `/event-teams/${teamId}/templates`,
              token,
            )
          : await getJson<{ templates: TeamTemplate[] }>(`/event-teams/${teamId}/templates`);
        if (!cancelled) {
          setState({ templates: data.templates, loading: false, error: null });
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof ApiError ? 'Failed to load games' : 'Unexpected error';
        setState({ templates: [], loading: false, error: msg });
      }
    }

    fetchTemplates();
    return () => {
      cancelled = true;
    };
  }, [teamId, token, options?.enabled]);

  return state;
}
