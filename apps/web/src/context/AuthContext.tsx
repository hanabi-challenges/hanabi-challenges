import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type AuthUser = {
  id: number;
  display_name: string;
  roles: string[];
  color_hex: string;
  text_color: string;
};

/** Returns true if the user has the given role or is a SUPERADMIN. */
export function hasRole(user: AuthUser | null, role: string): boolean {
  if (!user) return false;
  return user.roles.includes('SUPERADMIN') || user.roles.includes(role);
}

type AuthState = {
  user: AuthUser | null;
  token: string | null;
};

type AuthContextValue = AuthState & {
  login: (user: AuthUser, token: string) => void;
  logout: () => void;
};

const STORAGE_KEY = 'hanabi-auth';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    try {
      const cookieToken = getCookie('hanabi_token');
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { user: null, token: null };
      const parsed = JSON.parse(raw) as AuthState & { user: AuthUser & { role?: string } };
      return {
        user: parsed.user
          ? {
              ...parsed.user,
              roles: Array.isArray(parsed.user.roles)
                ? parsed.user.roles
                : parsed.user.role
                  ? ['USER', parsed.user.role]
                  : ['USER'],
              color_hex: parsed.user.color_hex || '#777777',
              text_color: parsed.user.text_color || '#ffffff',
            }
          : null,
        token: parsed.token ?? cookieToken ?? null,
      };
    } catch {
      return {
        user: null,
        token: getCookie('hanabi_token') ?? null,
      };
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (state.token) {
      setCookie('hanabi_token', state.token);
    } else {
      clearCookie('hanabi_token');
    }
  }, [state]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login: (user, token) =>
        setState({
          user: {
            ...user,
            color_hex: user.color_hex || '#777777',
            text_color: user.text_color || '#ffffff',
          },
          token,
        }),
      logout: () => setState({ user: null, token: null }),
    }),
    [state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${7 * 24 * 60 * 60}`;
}

function getCookie(name: string): string | null {
  const cookies = document.cookie.split(';').map((c) => c.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith(`${name}=`)) {
      return decodeURIComponent(cookie.slice(name.length + 1));
    }
  }
  return null;
}

function clearCookie(name: string) {
  document.cookie = `${name}=; Path=/; Max-Age=0`;
}
