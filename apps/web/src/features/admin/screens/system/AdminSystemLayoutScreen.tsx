import { CoreBox as Box, CoreDivider as Divider, PageHeader } from '../../../../design-system';
import { Outlet } from 'react-router-dom';

export function AdminSystemLayoutScreen() {
  return (
    <Box component="section">
      <PageHeader
        title="Data Deletion"
        subtitle="Destructive maintenance tools for event data."
        level={2}
      />
      <Divider my="md" />
      <Outlet />
    </Box>
  );
}
