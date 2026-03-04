import { useEffect, useState } from 'react';
import { ApiError, getJson } from '../lib/api';

export type EventMembership = {
  user_id: number;
  display_name: string;
  team_size: number;
  event_team_id: number;
};

type State = {
  memberships: EventMembership[];
  loading: boolean;
  error: string | null;
};

export function useEventMemberships(slug: string | undefined) {
  const [state, setState] = useState<State>(() =>
    !slug
      ? { memberships: [], loading: false, error: 'No event specified' }
      : { memberships: [], loading: true, error: null },
  );

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    async function fetchMemberships(currentSlug: string) {
      setState({ memberships: [], loading: true, error: null });
      try {
        const data = await getJson<EventMembership[]>(
          `/events/${encodeURIComponent(currentSlug)}/memberships`,
        );
        if (!cancelled) {
          setState({ memberships: data, loading: false, error: null });
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof ApiError ? 'Failed to load memberships' : 'Unexpected error';
        setState({ memberships: [], loading: false, error: msg });
      }
    }

    fetchMemberships(slug);
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return state;
}
