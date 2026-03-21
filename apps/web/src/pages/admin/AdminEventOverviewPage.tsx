import {
  Card,
  CardBody,
  CoreBadge as Badge,
  CoreGroup as Group,
  CoreStack as Stack,
  CoreText as Text,
  Heading,
} from '../../design-system';
import { useParams } from 'react-router-dom';
import { useEvent } from '../../hooks/useEvent';
import { useStages } from '../../hooks/useStages';

function mechanismColor(mechanism: string): string {
  switch (mechanism) {
    case 'SEEDED_LEADERBOARD':
      return 'teal';
    case 'GAUNTLET':
      return 'violet';
    case 'MATCH_PLAY':
      return 'orange';
    default:
      return 'gray';
  }
}

function mechanismLabel(mechanism: string): string {
  switch (mechanism) {
    case 'SEEDED_LEADERBOARD':
      return 'Challenge';
    case 'GAUNTLET':
      return 'Gauntlet';
    case 'MATCH_PLAY':
      return 'Match Play';
    default:
      return mechanism;
  }
}

export function AdminEventOverviewPage() {
  const { slug } = useParams<{ slug: string }>();
  const { event } = useEvent(slug);
  const { stages, loading: stagesLoading } = useStages(slug);

  return (
    <Stack gap="sm">
      <Text fw={600} size="sm">
        Stages ({event?.stage_count ?? 0})
      </Text>
      {stagesLoading ? (
        <Text c="dimmed" size="sm">
          Loading stages…
        </Text>
      ) : stages.length === 0 ? (
        <Text c="dimmed" size="sm">
          No stages yet.
        </Text>
      ) : (
        stages.map((stage) => (
          <Card key={stage.id} variant="outline" href={`/admin/events/${slug}/stages`}>
            <CardBody>
              <Stack gap={4}>
                <Heading level={4}>{stage.label}</Heading>
                <Group gap="xs" align="center">
                  <Badge color={mechanismColor(stage.mechanism)} variant="light" size="sm">
                    {mechanismLabel(stage.mechanism)}
                  </Badge>
                  <Badge variant="light" size="sm">
                    {stage.status}
                  </Badge>
                  <Text size="sm" c="dimmed">
                    {stage.game_slot_count} game slot{stage.game_slot_count === 1 ? '' : 's'} ·{' '}
                    {stage.team_count} team{stage.team_count === 1 ? '' : 's'}
                  </Text>
                </Group>
              </Stack>
            </CardBody>
          </Card>
        ))
      )}
    </Stack>
  );
}
