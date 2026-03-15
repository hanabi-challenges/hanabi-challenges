import { useEffect, useState } from 'react';
import { getJsonAuth, ApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { EventSummary } from './useEvents';

type State = {
  event: EventSummary | null;
  loading: boolean;
  error: string | null;
};

export function useEvent(slug: string | undefined) {
  const { token } = useAuth();
  const [state, setState] = useState<State>({ event: null, loading: true, error: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!slug || !token) return;
    let cancelled = false;

    async function fetchEvent() {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const data = await getJsonAuth<EventSummary>(
          `/events/${encodeURIComponent(slug!)}`,
          token as string,
        );
        if (!cancelled) setState({ event: data, loading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        setState({
          event: null,
          loading: false,
          error: err instanceof ApiError ? 'Failed to load event.' : 'Unexpected error',
        });
      }
    }

    fetchEvent();
    return () => {
      cancelled = true;
    };
  }, [slug, token, version]);

  const refetch = () => setVersion((v) => v + 1);
  return { ...state, refetch };
}
