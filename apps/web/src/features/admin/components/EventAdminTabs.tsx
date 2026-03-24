import { CoreDivider as Divider, Tabs } from '../../../design-system';
import { useNavigate, useParams, useLocation } from 'react-router-dom';

const NAV_TABS = [
  { key: 'overview', label: 'Overview', path: '' },
  { key: 'stages', label: 'Stages', path: '/stages' },
  { key: 'awards', label: 'Awards', path: '/awards' },
];

export function EventAdminTabs() {
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
    <>
      <Tabs items={tabItems} />
      <Divider />
    </>
  );
}
