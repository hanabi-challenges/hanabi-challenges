import { CoreBox as Box, CoreDivider as Divider, PageHeader } from '../../../../design-system';
import { Outlet } from 'react-router-dom';

export function AdminUsersLayoutScreen() {
  return (
    <Box component="section">
      <PageHeader title="Users" subtitle="Search user accounts and manage roles." level={2} />
      <Divider my="md" />
      <Outlet />
    </Box>
  );
}
