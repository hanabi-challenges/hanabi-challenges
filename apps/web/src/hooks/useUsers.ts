import { useEffect, useState } from 'react';
import { ApiError, getJson } from '../lib/api';

export type UserSummary = {
  id: number;
  display_name: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'USER';
  color_hex?: string;
  text_color?: string;
};

type State = {
  users: UserSummary[];
  loading: boolean;
  error: string | null;
};

export function useUsers() {
  const [state, setState] = useState<State>({ users: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;

    async function fetchUsers() {
      setState({ users: [], loading: true, error: null });
      try {
        const data = await getJson<UserSummary[]>('/users');
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
