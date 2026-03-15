import {
  Breadcrumbs,
  CoreBox as Box,
  CoreDivider as Divider,
  CoreStack as Stack,
  CoreText as Text,
  Tabs,
} from '../../../../design-system';
import { Outlet, useNavigate, useParams, useLocation } from 'react-router-dom';

const NAV_TABS = [
  { key: 'overview', label: 'Overview', path: '' },
  { key: 'stages', label: 'Stages', path: '/stages' },
  { key: 'registrations', label: 'Registrations', path: '/registrations' },
  { key: 'results', label: 'Results', path: '/results' },
  { key: 'awards', label: 'Awards', path: '/awards' },
];

export function AdminEventLayoutScreen() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const base = `/admin/events/${slug ?? ''}`;

  function activeKey(): string {
    const rest = location.pathname.slice(base.length).replace(/\/$/, '');
    const match = NAV_TABS.find((t) => t.path !== '' && rest.startsWith(t.path));
    return match?.key ?? 'overview';
  }

  const tabItems = NAV_TABS.map((t) => ({
    key: t.key,
    label: t.label,
    active: activeKey() === t.key,
    onSelect: () => navigate(`${base}${t.path}`),
  }));

  return (
    <Stack gap="md">
      <Box>
        <Breadcrumbs items={[{ label: 'Events', href: '/admin/events' }, { label: slug ?? '' }]} />
        <Text fw={700} size="lg" mt={4}>
          {slug}
        </Text>
      </Box>
      <Tabs items={tabItems} />
      <Divider />
      <Outlet />
    </Stack>
  );
}
