import { CoreStack as Stack, CoreText as Text } from '../../../design-system';
import { AdminLinkCard } from '../components';

type AdminHomeScreenProps = {
  isSuperAdmin: boolean;
};

export function AdminHomeScreen({ isSuperAdmin }: AdminHomeScreenProps) {
  return (
    <Stack gap="md">
      <Text c="dimmed">Use Admin to configure events and manage operator tools.</Text>

      <AdminLinkCard
        title="Events"
        description="Create and update event configuration."
        href="/admin/events"
      />

      <AdminLinkCard
        title="Content"
        description="View site content and legal/about links."
        href="/admin/content"
      />

      <AdminLinkCard
        title="Badges"
        description="Design badge visuals for future event reward sets."
        href="/admin/badges"
      />

      {isSuperAdmin ? (
        <>
          <AdminLinkCard
            title="Users"
            description="Search users and manage roles."
            href="/admin/users"
          />

          <AdminLinkCard
            title="Data Deletion"
            description="Super-admin destructive maintenance tools."
            href="/admin/data-deletion"
          />
        </>
      ) : null}
    </Stack>
  );
}
