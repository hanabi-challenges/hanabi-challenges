import { useParams } from 'react-router-dom';
import { NotFoundPage } from './NotFoundPage';
import { useChallengeDetail } from '../hooks/useChallengeDetail';
import { Heading, PageContainer, Section, Stack, Text, Main } from '../design-system';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';
import { PageStateNotice } from '../features/shared/PageStateNotice';

export function ChallengeDetailPage() {
  const { slug } = useParams<{ slug: string }>();

  const { challenge, loading, error, notFound } = useChallengeDetail(slug);
  if (notFound) {
    return <NotFoundPage />;
  }

  if (loading) {
    return <PageStateNotice message="Loading challenge..." />;
  }

  if (error && !challenge) {
    return <PageStateNotice title="Challenge" message={error} variant="error" />;
  }

  if (!challenge) {
    return <PageStateNotice title="Challenge not found" message="This challenge does not exist." />;
  }

  const startsAt = challenge.starts_at ? new Date(challenge.starts_at) : null;
  const endsAt = challenge.ends_at ? new Date(challenge.ends_at) : null;

  return (
    <Main>
      <PageContainer>
        <Section
          paddingY="lg"
          header={
            <Stack gap="xs">
              <Heading level={1}>{challenge.name}</Heading>
              {challenge.short_description ? (
                <Text variant="body">{challenge.short_description}</Text>
              ) : null}
              <Text variant="caption">Slug: {challenge.slug}</Text>
              {startsAt || endsAt ? (
                <Text variant="caption">
                  {startsAt ? `Starts: ${startsAt.toLocaleDateString()}` : null}
                  {startsAt && endsAt ? ' · ' : null}
                  {endsAt ? `Ends: ${endsAt.toLocaleDateString()}` : null}
                </Text>
              ) : null}
            </Stack>
          }
        >
          {challenge.long_description ? (
            <MarkdownRenderer markdown={challenge.long_description} />
          ) : null}
          <Text variant="muted">Seeds, teams, and results summary will appear here later.</Text>
        </Section>
      </PageContainer>
    </Main>
  );
}
