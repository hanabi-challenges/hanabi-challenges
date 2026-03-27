import { useEffect, useState } from 'react';
import {
  Container,
  Title,
  Stack,
  Table,
  Loader,
  Alert,
  Text,
  Anchor,
  Pagination,
  Group,
} from '@mantine/core';
import { Link } from 'react-router-dom';
import type { TicketSummary } from '@tracker/types';
import { api, ApiError } from '../api.js';
import { TicketStatusBadge } from '../components/TicketStatusBadge.js';

const PAGE_SIZE = 25;

export function TicketListPage() {
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const offset = (page - 1) * PAGE_SIZE;
    api
      .listTickets(PAGE_SIZE, offset)
      .then((data) => {
        setTickets(data.tickets);
        setTotal(data.total);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Failed to load tickets.');
      })
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Container size="lg" py="md">
      <Stack gap="md">
        <Title order={2}>Tickets</Title>

        {loading && <Loader />}
        {error && <Alert color="red">{error}</Alert>}

        {!loading && !error && (
          <>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Title</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Domain</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Submitted by</Table.Th>
                  <Table.Th>Created</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {tickets.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={6}>
                      <Text c="dimmed" ta="center">
                        No tickets found.
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                {tickets.map((ticket) => (
                  <Table.Tr key={ticket.id}>
                    <Table.Td>
                      <Anchor component={Link} to={`/tickets/${ticket.id}`}>
                        {ticket.title}
                      </Anchor>
                    </Table.Td>
                    <Table.Td>{ticket.type_slug.replace(/_/g, ' ')}</Table.Td>
                    <Table.Td>{ticket.domain_slug.replace(/_/g, ' ')}</Table.Td>
                    <Table.Td>
                      <TicketStatusBadge status={ticket.status_slug} />
                    </Table.Td>
                    <Table.Td>{ticket.submitted_by_display_name}</Table.Td>
                    <Table.Td>{new Date(ticket.created_at).toLocaleDateString()}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>

            <Group justify="center">
              <Pagination value={page} onChange={setPage} total={totalPages} />
            </Group>
          </>
        )}
      </Stack>
    </Container>
  );
}
