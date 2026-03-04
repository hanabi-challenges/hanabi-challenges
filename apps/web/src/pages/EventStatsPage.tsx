import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import * as d3 from 'd3';
import { ApiError, getJson, getJsonAuth, postJsonAuth } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { SpoilerGatePage } from './SpoilerGatePage';
import { useEventDetail } from '../hooks/useEventDetail';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Heading,
  Inline,
  Main,
  PageContainer,
  Pill,
  Section,
  Stack,
  Tabs,
  Text,
  CoreBox as Box,
} from '../design-system';

type TemplateStat = {
  template_id: number;
  template_index: number;
  seed_payload: string | null;
  variant: string | null;
  max_score: number | null;
  avg_score: number;
  avg_bdr: number;
  avg_win_rate: number;
  games_played: number;
};

type MeasureKey = 'avg_win_rate' | 'avg_score' | 'avg_bdr';

const MEASURES: { key: MeasureKey; label: string; format: (v: number) => string }[] = [
  { key: 'avg_win_rate', label: 'Avg Win Rate', format: (v) => `${Math.round(v * 100)}%` },
  { key: 'avg_score', label: 'Avg Score', format: (v) => v.toFixed(1) },
  { key: 'avg_bdr', label: 'Avg BDR', format: (v) => v.toFixed(1) },
];

const TEAM_SIZE_OPTIONS = [2, 3, 4, 5, 6];

export function EventStatsPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const { event } = useEventDetail(slug);
  const [teamSize, setTeamSize] = useState<number>(2);
  const [measure, setMeasure] = useState<MeasureKey>('avg_win_rate');
  const [data, setData] = useState<TemplateStat[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [gateMode, setGateMode] = useState<
    'loading' | 'allow' | 'login' | 'blocked' | 'prompt' | 'error'
  >('loading');
  const [gateError, setGateError] = useState<string | null>(null);
  const [forfeitLoading, setForfeitLoading] = useState(false);
  const [teamSizeHasTeams, setTeamSizeHasTeams] = useState<Record<number, boolean>>({});
  const [eventMeta, setEventMeta] = useState<{
    allow_late_registration?: boolean;
    registration_cutoff?: string | null;
    ends_at?: string | null;
    published?: boolean;
  } | null>(null);

  // Fetch minimal event metadata so we can determine if the event is closed (no spoiler risk).
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      try {
        const meta = await getJson<{
          allow_late_registration?: boolean;
          registration_cutoff?: string | null;
          ends_at?: string | null;
          published?: boolean;
        }>(`/events/${encodeURIComponent(slug)}`);
        if (!cancelled) setEventMeta(meta);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load event metadata for stats gate', err);
          setEventMeta({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!slug) return;

    // Wait until we know the event metadata before deciding gate mode.
    if (eventMeta === null) {
      setGateMode('loading');
      return;
    }

    // If the event has ended or registration is closed (and late registration is not allowed),
    // allow stats to be viewed without login since there is no spoiler risk.
    const now = Date.now();
    const endedAt = eventMeta?.ends_at ? new Date(eventMeta.ends_at).getTime() : null;
    const cutoff = eventMeta?.registration_cutoff
      ? new Date(eventMeta.registration_cutoff).getTime()
      : endedAt;
    const registrationClosed =
      cutoff != null && !eventMeta?.allow_late_registration && cutoff < now;
    if ((endedAt && endedAt < now) || registrationClosed) {
      setGateMode('allow');
      return;
    }

    if (!user || !token) {
      setGateMode('login');
      return;
    }

    let cancelled = false;
    const run = async () => {
      setGateMode('loading');
      setGateError(null);
      try {
        const statuses = await getJsonAuth<{ status: string; team_size: number }[]>(
          `/events/${encodeURIComponent(slug)}/eligibility/me`,
          token,
        );
        if (cancelled) return;
        const entries = Array.isArray(statuses) ? statuses : [];
        const hasEnrolled = entries.some((e) => e.status === 'ENROLLED');
        if (hasEnrolled) {
          setGateMode('blocked');
          return;
        }
        const allowedStatuses = ['INELIGIBLE', 'COMPLETED'];
        const missingSizes = [2, 3, 4, 5, 6].filter(
          (size) => !entries.some((e) => Number(e.team_size) === size),
        );
        const allAllowed =
          entries.length > 0 && entries.every((e) => allowedStatuses.includes(e.status));
        if (missingSizes.length === 0 && allAllowed) {
          setGateMode('allow');
        } else {
          setGateMode('prompt');
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setGateMode('login');
          return;
        }
        console.error('Failed to check eligibility', err);
        setGateError('Failed to check eligibility. Please try again.');
        setGateMode('error');
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [slug, token, user, eventMeta]);

  useEffect(() => {
    if (!slug || gateMode !== 'allow') return;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const resp = await getJson<{ templates: TemplateStat[] }>(
          `/events/${encodeURIComponent(slug)}/stats?team_size=${teamSize}`,
        );
        setData(resp.templates ?? []);
      } catch (err) {
        console.error('Failed to load stats', err);
        setError('Failed to load statistics');
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, teamSize, gateMode]);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      try {
        const teams = await getJson<Array<{ team_size: number }>>(
          `/events/${encodeURIComponent(slug)}/teams`,
        );
        if (cancelled) return;
        const next: Record<number, boolean> = {};
        for (const size of TEAM_SIZE_OPTIONS) {
          next[size] = (teams ?? []).some((team) => Number(team.team_size) === size);
        }
        setTeamSizeHasTeams(next);
      } catch {
        if (cancelled) return;
        setTeamSizeHasTeams({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (Object.keys(teamSizeHasTeams).length === 0) return;
    if (teamSizeHasTeams[teamSize] !== false) return;
    const firstAvailable = TEAM_SIZE_OPTIONS.find((size) => teamSizeHasTeams[size]);
    if (firstAvailable != null) setTeamSize(firstAvailable);
  }, [teamSizeHasTeams, teamSize]);

  const chartData = useMemo(
    () => data.slice().sort((a, b) => a.template_index - b.template_index),
    [data],
  );

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    const width = 900;
    const height = 480;
    const margin = { top: 24, right: 20, bottom: 90, left: 70 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const x = d3
      .scaleBand<string>()
      .domain(chartData.map((d) => d.seed_payload || `Seed ${d.template_index}`))
      .range([0, innerWidth])
      .padding(0.35);

    const values = chartData.map((d) => (d[measure] ?? 0) as number);
    const maxY = Math.max(1, d3.max(values) ?? 1);
    const y = d3.scaleLinear().domain([0, maxY]).nice().range([innerHeight, 0]);

    const color = d3.scaleOrdinal<string>().domain(['dot']).range(['#2563eb']);

    const g = svg
      .attr('viewBox', `0 0 ${width} ${height}`)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const xAxis = d3.axisBottom(x).tickFormat((d) => d);
    const yAxis = d3
      .axisLeft(y)
      .ticks(6)
      .tickFormat((v) =>
        measure === 'avg_win_rate' ? `${Math.round(Number(v) * 100)}%` : String(v),
      );

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .selectAll('text')
      .style('text-anchor', 'end')
      .attr('dx', '-0.6em')
      .attr('dy', '0.1em')
      .attr('transform', 'rotate(-35)');

    g.append('g').call(yAxis);

    g.append('g')
      .selectAll('circle')
      .data(chartData)
      .join('circle')
      .attr('cx', (d) => (x(d.seed_payload || `Seed ${d.template_index}`) ?? 0) + x.bandwidth() / 2)
      .attr('cy', (d) => y((d[measure] ?? 0) as number))
      .attr('r', 7)
      .attr('fill', () => color('dot'))
      .attr('opacity', 0.85);

    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + margin.bottom - 10)
      .attr('text-anchor', 'middle')
      .attr('fill', '#374151')
      .text('Game Seed');

    g.append('text')
      .attr('x', -margin.left + 10)
      .attr('y', -10)
      .attr('text-anchor', 'start')
      .attr('fill', '#374151')
      .style('font-weight', '600')
      .text(MEASURES.find((m) => m.key === measure)?.label ?? '');
  }, [chartData, measure]);

  if (!slug) {
    return (
      <Main>
        <PageContainer>
          <Section paddingY="lg">
            <Text variant="body">Event not specified.</Text>
          </Section>
        </PageContainer>
      </Main>
    );
  }

  if (gateMode !== 'allow') {
    return (
      <SpoilerGatePage
        mode={
          gateMode === 'login'
            ? 'login'
            : gateMode === 'blocked'
              ? 'blocked'
              : gateMode === 'prompt'
                ? 'prompt'
                : gateMode === 'loading'
                  ? 'loading'
                  : 'error'
        }
        eventSlug={slug}
        onForfeit={
          gateMode === 'prompt'
            ? async () => {
                if (!token) return;
                setForfeitLoading(true);
                setGateError(null);
                try {
                  await postJsonAuth(
                    `/events/${encodeURIComponent(slug)}/eligibility/spoilers`,
                    token,
                    { all_team_sizes: true, reason: 'event_stats_spoiler' },
                  );
                  setGateMode('allow');
                } catch (err) {
                  console.error('Failed to update eligibility', err);
                  setGateError('Failed to update eligibility. Please try again.');
                  setGateMode('prompt');
                } finally {
                  setForfeitLoading(false);
                }
              }
            : undefined
        }
        loading={forfeitLoading || gateMode === 'loading'}
        errorMessage={gateError}
      />
    );
  }

  return (
    <Main>
      <PageContainer>
        <Section paddingY="lg">
          <Stack gap="md">
            <Stack gap="sm">
              <Heading level={1}>{event?.name ?? 'Event'}</Heading>
              <Inline gap="xs" wrap align="center">
                {event ? (
                  <Pill size="sm" variant="accent">
                    {formatDateRange(event.starts_at ?? null, event.ends_at ?? null)}
                  </Pill>
                ) : null}
                {event?.event_status === 'LIVE' ? (
                  <Pill size="sm" variant="accent">
                    Live
                  </Pill>
                ) : null}
                {event?.event_status === 'COMPLETE' ? (
                  <Pill size="sm" variant="default">
                    Complete
                  </Pill>
                ) : null}
              </Inline>
              <Tabs
                items={[
                  {
                    key: 'overview',
                    label: 'Overview',
                    active: false,
                    onSelect: () => navigate(`/events/${slug}`),
                  },
                  {
                    key: 'stats',
                    label: 'Stats',
                    active: true,
                    onSelect: () => undefined,
                  },
                ]}
              />
            </Stack>

            <Inline gap="md" align="start" wrap>
              <Card variant="outline" separated style={{ flex: '1 1 0' }}>
                <CardBody>
                  <Stack gap="sm">
                    {loading && <Text variant="muted">Loading chart…</Text>}
                    {error && <Alert variant="error" message={error} />}
                    {!loading && !error && chartData.length === 0 && (
                      <Text variant="muted">No data yet for this team size.</Text>
                    )}
                    {chartData.length > 0 && (
                      <Box style={{ overflowX: 'auto' }}>
                        <svg ref={svgRef} />
                      </Box>
                    )}
                  </Stack>
                </CardBody>
              </Card>

              <Card
                variant="outline"
                separated
                style={{ flex: '0 0 280px', width: '280px', position: 'sticky', top: '1rem' }}
              >
                <CardHeader>
                  <Heading level={3}>Stats Controls</Heading>
                </CardHeader>
                <CardBody>
                  <Stack gap="md">
                    <Stack gap="xs">
                      <Text variant="muted">Team Size</Text>
                      <Inline gap="xs">
                        {TEAM_SIZE_OPTIONS.map((size) => (
                          <Button
                            key={size}
                            size="sm"
                            variant={teamSize === size ? 'secondary' : 'ghost'}
                            onClick={() => setTeamSize(size)}
                            disabled={teamSizeHasTeams[size] === false}
                          >
                            {size}P
                          </Button>
                        ))}
                      </Inline>
                    </Stack>
                    <Stack gap="xs">
                      <Text variant="muted">Measure</Text>
                      <Stack gap="xs">
                        {MEASURES.map((m) => (
                          <Button
                            key={m.key}
                            size="sm"
                            variant={measure === m.key ? 'secondary' : 'ghost'}
                            onClick={() => setMeasure(m.key)}
                          >
                            {m.label}
                          </Button>
                        ))}
                      </Stack>
                    </Stack>
                  </Stack>
                </CardBody>
              </Card>
            </Inline>
          </Stack>
        </Section>
      </PageContainer>
    </Main>
  );
}

function formatDateRange(startsAt: string | null, endsAt: string | null) {
  if (!startsAt && !endsAt) return '';
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;
  if (start && end) return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  if (start) return `Starts ${start.toLocaleDateString()}`;
  if (end) return `Ends ${end.toLocaleDateString()}`;
  return '';
}
