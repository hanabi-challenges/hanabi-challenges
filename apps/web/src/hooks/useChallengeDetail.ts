import { useEffect, useState } from 'react';
import { getJson, ApiError } from '../lib/api';

export type ChallengeDetail = {
  id: number;
  name: string;
  slug: string;
  short_description: string | null;
  long_description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at?: string;
};

type State = {
  challenge: ChallengeDetail | null;
  loading: boolean;
  error: string | null;
  notFound: boolean;
};

export function useChallengeDetail(slug: string | undefined) {
  const [state, setState] = useState<State>({
    challenge: null,
    loading: true,
    error: null,
    notFound: false,
  });

  useEffect(() => {
    if (!slug) {
      setState({
        challenge: null,
        loading: false,
        error: 'No challenge specified',
        notFound: false,
      });
      return;
    }

    let cancelled = false;

    async function fetchChallenge(currentSlug: string) {
      setState((prev) => ({
        ...prev,
        loading: true,
        error: null,
        notFound: false,
      }));

      try {
        // getJson will add /api → /api/challenges/:slug
        const data = await getJson<ChallengeDetail>(
          `/challenges/${encodeURIComponent(currentSlug)}`,
        );

        if (!cancelled) {
          setState({
            challenge: data,
            loading: false,
            error: null,
            notFound: false,
          });
        }
      } catch (err) {
        if (cancelled) return;

        if (err instanceof ApiError && err.status === 404) {
          setState({
            challenge: null,
            loading: false,
            error: null,
            notFound: true,
          });
        } else {
          console.error('Failed to load challenge', err);
          setState({
            challenge: null,
            loading: false,
            error: 'Failed to load challenge. Please try again.',
            notFound: false,
          });
        }
      }
    }

    fetchChallenge(slug);

    return () => {
      cancelled = true;
    };
  }, [slug]);

  return state;
}
