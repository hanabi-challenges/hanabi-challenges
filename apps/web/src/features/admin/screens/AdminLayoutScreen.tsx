import { CoreDivider as Divider, PageHeader, CoreStack as Stack } from '../../../design-system';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Tabs } from '../../../design-system';

type AdminLayoutScreenProps = {
  isSuperAdmin: boolean;
};

type AdminNavItem = {
  label: string;
  to: string;
  superAdminOnly?: boolean;
  exact?: boolean;
};

const adminNav: AdminNavItem[] = [
  { label: 'Home', to: '/admin', exact: true },
  { label: 'Events', to: '/admin/events' },
  { label: 'Badges', to: '/admin/badges' },
  { label: 'Content', to: '/admin/content' },
  { label: 'Users', to: '/admin/users', superAdminOnly: true },
  { label: 'Data Deletion', to: '/admin/data-deletion', superAdminOnly: true },
];

function isActivePath(currentPath: string, targetPath: string, exact = false) {
  if (exact) {
    return currentPath === targetPath;
  }
  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

export function AdminLayoutScreen({ isSuperAdmin }: AdminLayoutScreenProps) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <Stack gap="md" py="lg">
      <PageHeader title="Admin" subtitle="Configure events and admin-only site tools." level={1} />

      <Tabs
        items={adminNav
          .filter((item) => (item.superAdminOnly ? isSuperAdmin : true))
          .map((item) => ({
            key: item.to,
            label: item.label,
            active: isActivePath(location.pathname, item.to, item.exact),
            onSelect: () => navigate(item.to),
          }))}
      />

      <Divider />

      <Outlet />
    </Stack>
  );
}
