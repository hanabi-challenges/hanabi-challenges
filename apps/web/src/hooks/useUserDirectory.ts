import { useEffect, useState } from 'react';
import { ApiError, getJson } from '../lib/api';

export type UserDirectoryEntry = {
  id: number;
  display_name: string;
  color_hex: string;
  text_color: string;
};

type State = {
  users: UserDirectoryEntry[];
  loading: boolean;
  error: string | null;
};

export function useUserDirectory() {
  const [state, setState] = useState<State>({ users: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;

    async function fetchUsers() {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const data = await getJson<UserDirectoryEntry[]>('/users');
        if (!cancelled) {
          setState({ users: data, loading: false, error: null });
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof ApiError ? 'Failed to load users' : 'Unexpected error';
        setState({ users: [], loading: false, error: msg });
      }
    }

    fetchUsers();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
