import { AdminHomeScreen } from '../../features/admin/screens/AdminHomeScreen';
import { useAuth, hasRole } from '../../context/AuthContext';

export function AdminHomePage() {
  const { user } = useAuth();

  return <AdminHomeScreen isSuperAdmin={hasRole(user, 'SUPERADMIN')} />;
}
