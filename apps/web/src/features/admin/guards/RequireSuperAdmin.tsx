import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, hasRole } from '../../../context/AuthContext';

export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  if (!hasRole(user, 'SUPERADMIN')) {
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}
