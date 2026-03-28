import { useEffect, useRef, useState } from 'react';
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
  TextInput,
  ActionIcon,
} from '@mantine/core';
import { Link } from 'react-router-dom';
import type { TicketSummary } from '@tracker/types';
import { api, ApiError } from '../api.js';
import { TicketStatusBadge } from '../components/TicketStatusBadge.js';

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 500;

function TicketTable({ tickets }: { tickets: TicketSummary[] }) {
  return (
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
  );
}

export function TicketListPage() {
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TicketSummary[] | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load paginated list when not searching
  useEffect(() => {
    if (searchQuery) return;
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
  }, [page, searchQuery]);

  // Debounced search
  function handleSearchChange(value: string) {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setSearchQuery('');
      setSearchResults(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      setSearchQuery(value.trim());
      setSearching(true);
      api
        .searchTickets(value.trim())
        .then((data) => setSearchResults(data.tickets))
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, SEARCH_DEBOUNCE_MS);
  }

  function clearSearch() {
    setSearchInput('');
    setSearchQuery('');
    setSearchResults(null);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isSearching = Boolean(searchQuery);

  return (
    <Container size="lg" py="md">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={2}>Tickets</Title>
          <TextInput
            placeholder="Search tickets…"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.currentTarget.value)}
            rightSection={
              searchInput ? (
                <ActionIcon variant="subtle" onClick={clearSearch}>
                  ✕
                </ActionIcon>
              ) : null
            }
            w={280}
          />
        </Group>

        {(loading || searching) && <Loader />}
        {error && <Alert color="red">{error}</Alert>}

        {!loading && !searching && (
          <>
            {isSearching && searchResults !== null && (
              <>
                <Text size="sm" c="dimmed">
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for &ldquo;
                  {searchQuery}&rdquo;
                </Text>
                <TicketTable tickets={searchResults} />
              </>
            )}

            {!isSearching && !error && (
              <>
                <TicketTable tickets={tickets} />
                <Group justify="center">
                  <Pagination value={page} onChange={setPage} total={totalPages} />
                </Group>
              </>
            )}
          </>
        )}
      </Stack>
    </Container>
  );
}
