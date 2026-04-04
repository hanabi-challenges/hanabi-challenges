import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Inline,
  Main,
  PageContainer,
  PageHeader,
  Pagination,
  Popover,
  Section,
  Select,
  Stack,
  Text,
} from '../design-system';
import { useAuth } from '../context/AuthContext';
import { TicketCard } from '../features/feedback/TicketCard';
import { listTickets } from '../features/feedback/api';
import { STATUS_CONFIG, TYPE_LABELS, DOMAIN_LABELS } from '../features/feedback/statusConfig';
import type { TicketSummary, StatusSlug } from '../features/feedback/types';

const PAGE_SIZE = 20;

const STATUS_OPTIONS = (
  Object.entries(STATUS_CONFIG) as [StatusSlug, (typeof STATUS_CONFIG)[StatusSlug]][]
).map(([value, { label }]) => ({ value, label }));

const TYPE_OPTIONS = Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }));
const DOMAIN_OPTIONS = Object.entries(DOMAIN_LABELS).map(([value, label]) => ({ value, label }));

export function FeedbackIndexPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [domainFilter, setDomainFilter] = useState('');

  const activeFilterCount = [statusFilter, typeFilter, domainFilter].filter(Boolean).length;

  useEffect(() => {
    setLoading(true);
    setError(null);
    listTickets({
      offset: (page - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
      status_slug: statusFilter || undefined,
      type_slug: typeFilter || undefined,
      domain_slug: domainFilter || undefined,
    })
      .then((res) => {
        setTickets(res.tickets);
        setTotal(res.total);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load tickets.');
      })
      .finally(() => setLoading(false));
  }, [page, statusFilter, typeFilter, domainFilter]);

  // Reset to page 1 whenever filters change
  const handleFilterChange = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  const clearFilters = () => {
    setStatusFilter('');
    setTypeFilter('');
    setDomainFilter('');
    setPage(1);
  };

  return (
    <Main>
      <PageContainer>
        <Section
          paddingY="lg"
          baseLevel={1}
          header={
            <PageHeader
              title="Feedback"
              subtitle="Report bugs, request features, and track what we're working on."
              actions={
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => navigate('/feedback/new')}
                  disabled={!user}
                  title={!user ? 'Log in to submit feedback' : undefined}
                >
                  Submit feedback
                </Button>
              }
            />
          }
        >
          <Inline justify="space-between" align="center">
            <Text variant="muted">
              {loading ? 'Loading…' : `${total} item${total === 1 ? '' : 's'}`}
            </Text>

            <Popover
              trigger={
                <Button variant="secondary" size="sm">
                  {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : 'Filters'}
                </Button>
              }
              position="bottom-end"
              width={240}
            >
              <Stack gap="sm">
                <Select
                  options={STATUS_OPTIONS}
                  value={statusFilter}
                  onChange={handleFilterChange(setStatusFilter)}
                  placeholder="All statuses"
                />
                <Select
                  options={TYPE_OPTIONS}
                  value={typeFilter}
                  onChange={handleFilterChange(setTypeFilter)}
                  placeholder="All types"
                />
                <Select
                  options={DOMAIN_OPTIONS}
                  value={domainFilter}
                  onChange={handleFilterChange(setDomainFilter)}
                  placeholder="All domains"
                />
                {activeFilterCount > 0 ? (
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : null}
              </Stack>
            </Popover>
          </Inline>

          {error ? <Alert variant="error" message={error} /> : null}

          {!loading && !error ? (
            tickets.length === 0 ? (
              <Text variant="muted">No feedback matches the current filters.</Text>
            ) : (
              <Stack gap="sm">
                {tickets.map((ticket) => (
                  <TicketCard key={ticket.id} ticket={ticket} />
                ))}
              </Stack>
            )
          ) : null}

          {!loading && total > PAGE_SIZE ? (
            <Pagination
              totalItems={total}
              pageSize={PAGE_SIZE}
              currentPage={page}
              onPageChange={setPage}
            />
          ) : null}

          {!user ? (
            <Text variant="caption">
              <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>
                Log in
              </Button>{' '}
              to submit feedback or vote.
            </Text>
          ) : null}
        </Section>
      </PageContainer>
    </Main>
  );
}
