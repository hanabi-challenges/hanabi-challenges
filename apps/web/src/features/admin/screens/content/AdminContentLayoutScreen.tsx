import { CoreBox as Box, CoreDivider as Divider, PageHeader } from '../../../../design-system';
import { Outlet } from 'react-router-dom';

export function AdminContentLayoutScreen() {
  return (
    <Box component="section">
      <PageHeader title="Content" subtitle="Content and static page links." level={2} />
      <Divider my="md" />
      <Outlet />
    </Box>
  );
}
