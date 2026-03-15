import { useEffect, useState } from 'react';
import { getJson, ApiError, getJsonAuth } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export type EventSummary = {
  id: number;
  slug: string;
  name: string;
  short_description: string | null;
  long_description: string;
  published: boolean;
  status:
    | 'ANNOUNCED'
    | 'UPCOMING'
    | 'REGISTRATION_OPEN'
    | 'IN_PROGRESS'
    | 'LIVE'
    | 'COMPLETE'
    | 'DORMANT';
  registration_mode: 'ACTIVE' | 'PASSIVE';
  allowed_team_sizes: number[];
  combined_leaderboard: boolean;
  allow_late_registration: boolean;
  registration_opens_at: string | null;
  registration_cutoff: string | null;
  starts_at: string | null;
  ends_at: string | null;
  stage_count: number;
};

type State = {
  events: EventSummary[];
  loading: boolean;
  error: string | null;
};

type Options = {
  includeUnpublishedForAdmin?: boolean;
};

export function useEvents(options: Options = {}) {
  const { includeUnpublishedForAdmin = false } = options;
  const { user, token } = useAuth();
  const [state, setState] = useState<State>({
    events: [],
    loading: true,
    error: null,
  });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchEvents() {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      const isAdmin = user && (user.role === 'ADMIN' || user.role === 'SUPERADMIN');
      const shouldAuth = includeUnpublishedForAdmin && isAdmin && !!token;

      try {
        let data: EventSummary[];
        if (shouldAuth) {
          try {
            data = await getJsonAuth<EventSummary[]>('/events', token as string);
          } catch {
            // If auth fails, fall back to public list
            data = await getJson<EventSummary[]>('/events');
          }
        } else {
          data = await getJson<EventSummary[]>('/events');
        }

        if (!cancelled) {
          setState({
            events: data,
            loading: false,
            error: null,
          });
        }
      } catch (err) {
        if (cancelled) return;

        const errorMessage =
          err instanceof ApiError ? 'Failed to load events. Please try again.' : 'Unexpected error';

        console.error('Failed to load events', err);
        setState({
          events: [],
          loading: false,
          error: errorMessage,
        });
      }
    }

    fetchEvents();
    return () => {
      cancelled = true;
    };
  }, [includeUnpublishedForAdmin, token, user, version]);

  const refetch = () => setVersion((v) => v + 1);

  return { ...state, refetch };
}
