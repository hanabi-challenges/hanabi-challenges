import { useEffect, useState } from 'react';
import { getJson, ApiError, getJsonAuth } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export type EventDetail = {
  id: number;
  name: string;
  slug: string;
  short_description: string | null;
  long_description: string | null;
  published?: boolean;
  event_format?: 'challenge' | 'tournament' | 'session_ladder';
  event_status?: 'DORMANT' | 'LIVE' | 'COMPLETE';
  round_robin_enabled?: boolean;
  max_teams?: number | null;
  max_rounds?: number | null;
  allow_late_registration?: boolean;
  enforce_exact_team_size?: boolean;
  registration_opens_at?: string | null;
  registration_cutoff?: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at?: string;
};

type State = {
  event: EventDetail | null;
  loading: boolean;
  error: string | null;
  notFound: boolean;
};

export function useEventDetail(slug: string | undefined) {
  const { user, token } = useAuth();
  const [state, setState] = useState<State>(() =>
    !slug
      ? {
          event: null,
          loading: false,
          error: 'No event specified',
          notFound: false,
        }
      : {
          event: null,
          loading: true,
          error: null,
          notFound: false,
        },
  );

  useEffect(() => {
    // If there's no slug, we don't run the effect at all.
    // The "no event specified" state is handled in the initializer above.
    if (!slug) {
      return;
    }

    let cancelled = false;

    async function fetchEvent() {
      setState((prev) => ({
        ...prev,
        loading: true,
        error: null,
        notFound: false,
      }));

      try {
        // getJson will add /api → /api/events/:slug
        const encodedSlug = encodeURIComponent(slug as string);
        const isAdmin = user && (user.role === 'ADMIN' || user.role === 'SUPERADMIN');
        const shouldAuth = isAdmin && !!token;

        let data: EventDetail;
        if (shouldAuth) {
          try {
            data = await getJsonAuth<EventDetail>(`/events/${encodedSlug}`, token as string);
          } catch {
            // If auth fails, fall back to public fetch
            data = await getJson<EventDetail>(`/events/${encodedSlug}`);
          }
        } else {
          data = await getJson<EventDetail>(`/events/${encodedSlug}`);
        }

        if (!cancelled) {
          setState({
            event: data,
            loading: false,
            error: null,
            notFound: false,
          });
        }
      } catch (err) {
        if (cancelled) return;

        if (err instanceof ApiError && err.status === 404) {
          setState({
            event: null,
            loading: false,
            error: null,
            notFound: true,
          });
        } else {
          console.error('Failed to load event', err);
          setState({
            event: null,
            loading: false,
            error: 'Failed to load event. Please try again.',
            notFound: false,
          });
        }
      }
    }

    fetchEvent();

    return () => {
      cancelled = true;
    };
  }, [slug, token, user]);

  return state;
}
