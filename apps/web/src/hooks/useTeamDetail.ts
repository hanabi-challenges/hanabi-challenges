import { useEffect, useState } from 'react';
import { ApiError, getJson, getJsonAuth } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export type TeamMember = {
  id: number;
  event_team_id: number;
  user_id: number;
  role: 'PLAYER' | 'STAFF';
  is_listed: boolean;
  created_at: string;
  display_name: string;
  color_hex: string;
  text_color: string;
};

export type TeamGame = {
  id: number;
  event_game_template_id: number;
  game_id: number | null;
  score: number;
  zero_reason: string | null;
  bottom_deck_risk: number | null;
  notes: string | null;
  played_at: string;
  event_stage_id: number;
  stage_index: number;
  stage_label: string;
  stage_type: 'SINGLE' | 'ROUND_ROBIN' | 'BRACKET' | 'GAUNTLET';
  template_index: number;
  variant: string;
  players: {
    display_name: string;
    color_hex: string;
    text_color: string;
  }[];
};

export type TeamDetail = {
  team: {
    id: number;
    event_id: number;
    name: string;
    team_size: number;
    created_at: string;
    event_slug: string;
    event_name: string;
    table_password?: string | null;
    owner_user_id?: number | null;
  };
  members: TeamMember[];
  games: TeamGame[];
};

export type TeamGate = {
  mode: 'login' | 'blocked' | 'prompt';
  event_slug: string;
  team_size: number;
  team_name?: string;
  message?: string;
};

type State = {
  data: TeamDetail | null;
  loading: boolean;
  error: string | null;
  notFound: boolean;
  gate: TeamGate | null;
};

export function useTeamDetail(teamId: number | null | undefined) {
  const { token } = useAuth();
  const [state, setState] = useState<State>(() =>
    teamId == null
      ? { data: null, loading: false, error: 'No team specified', notFound: false, gate: null }
      : { data: null, loading: true, error: null, notFound: false, gate: null },
  );

  useEffect(() => {
    if (teamId == null) return;

    let cancelled = false;

    async function fetchTeam() {
      setState((prev) => ({ ...prev, loading: true, error: null, notFound: false, gate: null }));

      try {
        const data = token
          ? await getJsonAuth<TeamDetail>(`/event-teams/${teamId}`, token)
          : await getJson<TeamDetail>(`/event-teams/${teamId}`);

        if (!cancelled) {
          setState({ data, loading: false, error: null, notFound: false, gate: null });
        }
      } catch (err) {
        if (cancelled) return;

        if (err instanceof ApiError && err.status === 404) {
          setState({ data: null, loading: false, error: null, notFound: true, gate: null });
        } else if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          const body = (err.body ?? {}) as Record<string, unknown>;
          const gateMode =
            err.status === 401 ? 'login' : body?.status === 'ENROLLED' ? 'blocked' : 'prompt';
          const gate: TeamGate = {
            mode: gateMode,
            event_slug: (body.event_slug as string) ?? '',
            team_size: Number(body.team_size ?? 0),
            team_name: (body.team_name as string) ?? undefined,
            message: typeof body.error === 'string' ? body.error : undefined,
          };
          setState({ data: null, loading: false, error: null, notFound: false, gate });
        } else {
          console.error('Failed to load team detail', err);
          setState({
            data: null,
            loading: false,
            error: 'Failed to load team. Please try again.',
            notFound: false,
            gate: null,
          });
        }
      }
    }

    fetchTeam();

    return () => {
      cancelled = true;
    };
  }, [teamId, token]);

  const refetch = async () => {
    if (teamId == null) return;
    setState((prev) => ({ ...prev, loading: true, error: null, notFound: false, gate: null }));
    try {
      const data = token
        ? await getJsonAuth<TeamDetail>(`/event-teams/${teamId}`, token)
        : await getJson<TeamDetail>(`/event-teams/${teamId}`);
      setState({ data, loading: false, error: null, notFound: false, gate: null });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setState({ data: null, loading: false, error: null, notFound: true, gate: null });
      } else if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        const body = (err.body ?? {}) as Record<string, unknown>;
        const gateMode =
          err.status === 401 ? 'login' : body?.status === 'ENROLLED' ? 'blocked' : 'prompt';
        const gate: TeamGate = {
          mode: gateMode,
          event_slug: (body.event_slug as string) ?? '',
          team_size: Number(body.team_size ?? 0),
          team_name: (body.team_name as string) ?? undefined,
          message: typeof body.error === 'string' ? body.error : undefined,
        };
        setState({ data: null, loading: false, error: null, notFound: false, gate });
      } else {
        console.error('Failed to load team detail', err);
        setState({
          data: null,
          loading: false,
          error: 'Failed to load team. Please try again.',
          notFound: false,
          gate: null,
        });
      }
    }
  };

  return { ...state, refetch };
}
