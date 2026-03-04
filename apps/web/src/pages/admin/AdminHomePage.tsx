import { AdminHomeScreen } from '../../features/admin/screens/AdminHomeScreen';
import { useAuth } from '../../context/AuthContext';

export function AdminHomePage() {
  const { user } = useAuth();

  return <AdminHomeScreen isSuperAdmin={user?.role === 'SUPERADMIN'} />;
}
