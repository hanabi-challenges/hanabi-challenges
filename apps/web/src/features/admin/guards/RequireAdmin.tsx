import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, hasRole } from '../../../context/AuthContext';

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isAdmin = hasRole(user, 'HOST') || hasRole(user, 'SITE_ADMIN');

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
