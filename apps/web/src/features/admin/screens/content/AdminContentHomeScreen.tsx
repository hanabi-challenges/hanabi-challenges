import { CoreGrid as Grid, CoreStack as Stack, CoreText as Text } from '../../../../design-system';
import { AdminLinkCard } from '../../components';

type ContentLink = {
  label: string;
  to: string;
  pathLabel: string;
};

type ContentGroup = {
  title: string;
  links: ContentLink[];
};

const contentGroups: ContentGroup[] = [
  {
    title: 'About',
    links: [
      { label: 'Home', to: '/admin/content/home', pathLabel: '/' },
      { label: 'About', to: '/admin/content/about', pathLabel: '/about' },
      { label: 'FAQ', to: '/admin/content/faq', pathLabel: '/about/FAQ' },
    ],
  },
  {
    title: 'Community',
    links: [
      { label: 'Contact', to: '/admin/content/contact', pathLabel: '/contact' },
      { label: 'Feedback', to: '/admin/content/feedback', pathLabel: '/feedback' },
      {
        label: 'Code of Conduct',
        to: '/admin/content/code-of-conduct',
        pathLabel: '/code-of-conduct',
      },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms', to: '/admin/content/terms', pathLabel: '/legal/terms' },
      { label: 'Privacy', to: '/admin/content/privacy', pathLabel: '/legal/privacy' },
    ],
  },
];

export function AdminContentHomeScreen() {
  return (
    <Stack gap="md">
      <Text c="dimmed" size="sm">
        Edit public static pages and preview what users see.
      </Text>

      <Grid gutter="md">
        {contentGroups.map((group) => (
          <Grid.Col key={group.title} span={{ base: 12, md: 4 }}>
            <Stack gap="sm">
              <Text fw={700}>{group.title}</Text>
              {group.links.map((item) => (
                <AdminLinkCard
                  key={item.to}
                  title={item.label}
                  description={`Edit ${item.pathLabel}`}
                  href={item.to}
                />
              ))}
            </Stack>
          </Grid.Col>
        ))}
      </Grid>
    </Stack>
  );
}
