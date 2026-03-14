import { CoreBox as Box, CoreDivider as Divider, PageHeader } from '../../../../design-system';
import { Outlet } from 'react-router-dom';

export function AdminSystemLayoutScreen() {
  return (
    <Box component="section">
      <PageHeader
        title="System"
        subtitle="Variant catalog, data maintenance, and other superadmin tools."
        level={2}
      />
      <Divider my="md" />
      <Outlet />
    </Box>
  );
}
