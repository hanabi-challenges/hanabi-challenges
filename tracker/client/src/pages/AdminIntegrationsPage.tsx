import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Container,
  Title,
  Card,
  Text,
  Button,
  Alert,
  Loader,
  Center,
  Stack,
  Group,
  Badge,
  Anchor,
  Divider,
} from '@mantine/core';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api.js';

interface FailedWebhook {
  id: string;
  github_event: string;
  error: string | null;
  received_at: string;
}

interface MissingLink {
  ticket_id: string;
  ticket_title: string;
  status_slug: string;
}

interface LinkedTicket {
  ticket_id: string;
  ticket_title: string;
  status_slug: string;
  issue_number: number;
  issue_url: string;
}

interface FailuresData {
  failed_webhooks: FailedWebhook[];
  tickets_missing_link: MissingLink[];
}

interface ReconcileData {
  linked: LinkedTicket[];
  missing: MissingLink[];
}

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export function AdminIntegrationsPage() {
  const [failures, setFailures] = useState<FailuresData | null>(null);
  const [loadingFailures, setLoadingFailures] = useState(true);
  const [failuresError, setFailuresError] = useState<string | null>(null);

  const [reconcile, setReconcile] = useState<ReconcileData | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileError, setReconcileError] = useState<string | null>(null);

  const refreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFailures = useCallback(async () => {
    try {
      const data = await api.getGithubFailures();
      setFailures(data);
      setFailuresError(null);
    } catch (err) {
      setFailuresError(err instanceof ApiError ? err.message : 'Failed to load integration data.');
    } finally {
      setLoadingFailures(false);
    }
  }, []);

  useEffect(() => {
    void loadFailures();
    refreshRef.current = setInterval(() => void loadFailures(), REFRESH_INTERVAL_MS);
    return () => {
      if (refreshRef.current !== null) clearInterval(refreshRef.current);
    };
  }, [loadFailures]);

  async function handleReconcile() {
    setReconciling(true);
    setReconcileError(null);
    try {
      const data = await api.runReconcile();
      setReconcile(data);
    } catch (err) {
      setReconcileError(err instanceof ApiError ? err.message : 'Reconciliation failed.');
    } finally {
      setReconciling(false);
    }
  }

  return (
    <Container mt="md">
      <Title order={2} mb="md">
        Integration Health
      </Title>

      <Stack gap="md">
        {/* GitHub Failures */}
        <Card withBorder>
          <Title order={4} mb="sm">
            GitHub Integration
          </Title>

          {loadingFailures ? (
            <Center>
              <Loader size="sm" />
            </Center>
          ) : failuresError ? (
            <Alert color="red">{failuresError}</Alert>
          ) : (
            <>
              <Text fw={500} mb="xs">
                Failed Webhooks
              </Text>
              {failures?.failed_webhooks.length === 0 ? (
                <Text c="dimmed" size="sm" mb="md">
                  No failed webhooks.
                </Text>
              ) : (
                <Stack gap="xs" mb="md">
                  {failures?.failed_webhooks.map((wh) => (
                    <Card key={wh.id} withBorder p="xs">
                      <Group>
                        <Badge color="red" variant="outline">
                          {wh.github_event}
                        </Badge>
                        <Text size="xs" c="dimmed">
                          {new Date(wh.received_at).toLocaleString()}
                        </Text>
                      </Group>
                      {wh.error && (
                        <Text size="xs" c="red" mt="xs">
                          {wh.error}
                        </Text>
                      )}
                    </Card>
                  ))}
                </Stack>
              )}

              <Divider mb="sm" />

              <Text fw={500} mb="xs">
                In-Review Tickets Missing GitHub Link
              </Text>
              {failures?.tickets_missing_link.length === 0 ? (
                <Text c="dimmed" size="sm">
                  All in-review tickets have GitHub links.
                </Text>
              ) : (
                <Stack gap="xs">
                  {failures?.tickets_missing_link.map((t) => (
                    <Group key={t.ticket_id}>
                      <Anchor component={Link} to={`/tickets/${t.ticket_id}`} size="sm">
                        {t.ticket_title}
                      </Anchor>
                      <Badge size="xs">{t.status_slug}</Badge>
                    </Group>
                  ))}
                </Stack>
              )}
            </>
          )}
        </Card>

        {/* Reconciliation */}
        <Card withBorder>
          <Title order={4} mb="sm">
            Reconciliation
          </Title>
          <Text size="sm" c="dimmed" mb="md">
            Check all linked open tickets for mismatches between tracker status and GitHub issue
            state.
          </Text>

          <Button loading={reconciling} onClick={() => void handleReconcile()} mb="md">
            Run Reconciliation
          </Button>

          {reconcileError && (
            <Alert color="red" mb="md">
              {reconcileError}
            </Alert>
          )}

          {reconcile !== null && (
            <>
              <Text fw={500} mb="xs">
                In-Review Tickets Missing GitHub Link ({reconcile.missing.length})
              </Text>
              {reconcile.missing.length === 0 ? (
                <Text size="sm" c="dimmed" mb="md">
                  No mismatches found.
                </Text>
              ) : (
                <Stack gap="xs" mb="md">
                  {reconcile.missing.map((t) => (
                    <Group key={t.ticket_id}>
                      <Anchor component={Link} to={`/tickets/${t.ticket_id}`} size="sm">
                        {t.ticket_title}
                      </Anchor>
                      <Badge size="xs">{t.status_slug}</Badge>
                    </Group>
                  ))}
                </Stack>
              )}

              <Text fw={500} mb="xs">
                Linked Open Tickets ({reconcile.linked.length})
              </Text>
              {reconcile.linked.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No linked tickets.
                </Text>
              ) : (
                <Stack gap="xs">
                  {reconcile.linked.map((t) => (
                    <Group key={t.ticket_id}>
                      <Anchor component={Link} to={`/tickets/${t.ticket_id}`} size="sm">
                        {t.ticket_title}
                      </Anchor>
                      <Badge size="xs">{t.status_slug}</Badge>
                      <Anchor href={t.issue_url} target="_blank" size="xs">
                        #{t.issue_number}
                      </Anchor>
                    </Group>
                  ))}
                </Stack>
              )}
            </>
          )}
        </Card>
      </Stack>
    </Container>
  );
}
