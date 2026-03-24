// SimulateEventButton — event-level simulation trigger in the admin stages page.
//
// The same shadow teams (sim-e{eventId}-t*) play across every TEAM stage in the
// event in a single pass, so results are comparable across stages.

import { useState } from 'react';
import {
  CoreActionIcon,
  CoreAlert as Alert,
  CoreBadge as Badge,
  CoreButton as Button,
  CoreGroup as Group,
  CoreModal,
  CoreNumberInput,
  CoreSkeleton as Skeleton,
  CoreStack as Stack,
  CoreTable,
  CoreText as Text,
  Heading,
  Inline,
  MaterialIcon,
} from '../../../design-system';
import { useEventSimulation, type EventSimulationGameResult } from '../../../hooks/useSimulation';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    hour12: false,
  });
}

function fmtNum(v: number | null, decimals = 0): string {
  if (v === null) return '—';
  return decimals > 0 ? v.toFixed(decimals) : String(v);
}

function handlingLabel(h: string): string {
  switch (h) {
    case 'ingested':
      return 'Ingested';
    case 'skipped:already_played':
      return 'Already played';
    case 'skipped:repeat_player':
      return 'Repeat player';
    case 'skipped:before_window':
      return 'Before window';
    case 'skipped:after_window':
      return 'After window';
    case 'skipped:no_timestamp':
      return 'No timestamp';
    case 'skipped:empty_export':
      return 'Empty export';
    case 'skipped:multi_registration':
      return 'Multi-reg limit';
    case 'error:ambiguous_team':
      return 'Ambiguous team';
    default:
      if (h.startsWith('error:')) return `Error: ${h.slice(6)}`;
      if (h.startsWith('skipped:')) return `Skipped: ${h.slice(8)}`;
      return h;
  }
}

function handlingColor(h: string): string {
  if (h === 'ingested') return 'teal';
  if (h.startsWith('error:')) return 'red';
  return 'orange';
}

function exportToCsv(eventName: string, results: EventSimulationGameResult[]) {
  if (!results || results.length === 0) return;

  const headers = [
    'Handling',
    'Stage',
    'Slot #',
    'Slot Name',
    'Game ID',
    'Players',
    'Started At (UTC)',
    'Finished At (UTC)',
    'Score',
    'Bottom Deck Risk',
    'Strikes',
    'Clues Remaining',
  ];

  const rows = results.map((r) => [
    handlingLabel(r.handling),
    r.stage_label,
    String(r.game_index + 1),
    r.slot_nickname ?? '',
    String(r.hanabi_live_game_id),
    r.players.join('; '),
    r.started_at ? new Date(r.started_at).toISOString() : '',
    r.played_at ? new Date(r.played_at).toISOString() : '',
    r.score !== null ? String(r.score) : '',
    r.bottom_deck_risk !== null ? String(r.bottom_deck_risk) : '',
    r.strikes !== null ? String(r.strikes) : '',
    r.clues_remaining !== null ? String(r.clues_remaining) : '',
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `sim-event-${eventName.toLowerCase().replace(/\s+/g, '-')}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Results table grouped by stage
// ---------------------------------------------------------------------------

function EventSimulationResultsTable({ results }: { results: EventSimulationGameResult[] }) {
  if (results.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No simulation results found for this event.
      </Text>
    );
  }

  // Group by stage_label (preserving order)
  const stageOrder: string[] = [];
  const byStage = new Map<string, EventSimulationGameResult[]>();
  for (const r of results) {
    if (!byStage.has(r.stage_label)) {
      stageOrder.push(r.stage_label);
      byStage.set(r.stage_label, []);
    }
    byStage.get(r.stage_label)!.push(r);
  }

  return (
    <Stack gap="md">
      {stageOrder.map((label) => {
        const stageResults = byStage.get(label)!;
        return (
          <Stack key={label} gap="xs">
            <Text fw={600} size="sm">
              {label}
            </Text>
            <div style={{ overflowX: 'auto' }}>
              <CoreTable striped highlightOnHover withTableBorder withColumnBorders>
                <CoreTable.Thead>
                  <CoreTable.Tr>
                    <CoreTable.Th>Handling</CoreTable.Th>
                    <CoreTable.Th>Slot</CoreTable.Th>
                    <CoreTable.Th>Game ID</CoreTable.Th>
                    <CoreTable.Th>Players</CoreTable.Th>
                    <CoreTable.Th>Started</CoreTable.Th>
                    <CoreTable.Th>Finished</CoreTable.Th>
                    <CoreTable.Th style={{ textAlign: 'right' }}>Score</CoreTable.Th>
                    <CoreTable.Th style={{ textAlign: 'right' }}>BDR</CoreTable.Th>
                    <CoreTable.Th style={{ textAlign: 'right' }}>Strikes</CoreTable.Th>
                    <CoreTable.Th style={{ textAlign: 'right' }}>Clues</CoreTable.Th>
                  </CoreTable.Tr>
                </CoreTable.Thead>
                <CoreTable.Tbody>
                  {stageResults.map((r) => (
                    <CoreTable.Tr key={r.hanabi_live_game_id}>
                      <CoreTable.Td>
                        <Badge variant="light" color={handlingColor(r.handling)} size="sm">
                          {handlingLabel(r.handling)}
                        </Badge>
                      </CoreTable.Td>
                      <CoreTable.Td>
                        <Text size="sm" fw={500}>
                          {r.slot_nickname ?? `#${r.game_index + 1}`}
                        </Text>
                      </CoreTable.Td>
                      <CoreTable.Td>
                        <Text size="xs" c="dimmed" ff="monospace">
                          {r.hanabi_live_game_id}
                        </Text>
                      </CoreTable.Td>
                      <CoreTable.Td>
                        <Text size="sm">{r.players.join(', ')}</Text>
                      </CoreTable.Td>
                      <CoreTable.Td>
                        <Text size="xs" c="dimmed">
                          {fmt(r.started_at)}
                        </Text>
                      </CoreTable.Td>
                      <CoreTable.Td>
                        <Text size="xs" c="dimmed">
                          {fmt(r.played_at)}
                        </Text>
                      </CoreTable.Td>
                      <CoreTable.Td style={{ textAlign: 'right' }}>
                        <Text size="sm" fw={600}>
                          {r.score !== null ? r.score : '—'}
                        </Text>
                      </CoreTable.Td>
                      <CoreTable.Td style={{ textAlign: 'right' }}>
                        <Text
                          size="sm"
                          c={
                            r.bottom_deck_risk !== null && r.bottom_deck_risk > 0
                              ? 'orange'
                              : undefined
                          }
                        >
                          {fmtNum(r.bottom_deck_risk)}
                        </Text>
                      </CoreTable.Td>
                      <CoreTable.Td style={{ textAlign: 'right' }}>
                        <Text size="sm" c={r.strikes !== null && r.strikes > 0 ? 'red' : undefined}>
                          {fmtNum(r.strikes)}
                        </Text>
                      </CoreTable.Td>
                      <CoreTable.Td style={{ textAlign: 'right' }}>
                        <Text size="sm">{fmtNum(r.clues_remaining)}</Text>
                      </CoreTable.Td>
                    </CoreTable.Tr>
                  ))}
                </CoreTable.Tbody>
              </CoreTable>
            </div>
          </Stack>
        );
      })}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// SimulateEventButton
// ---------------------------------------------------------------------------

export function SimulateEventButton({
  eventSlug,
  eventName,
}: {
  eventSlug: string;
  eventName: string;
}) {
  const [open, setOpen] = useState(false);
  const [teamsPerSize, setTeamsPerSize] = useState(3);

  const sim = useEventSimulation(eventSlug);

  const hasResults = (sim.results?.length ?? 0) > 0;
  const canRun = !sim.running && !sim.resultsLoading;

  async function handleOpen() {
    setOpen(true);
    await sim.loadResults();
  }

  function handleClose() {
    setOpen(false);
  }

  async function handleRun() {
    const result = await sim.simulate({ teamsPerSize });
    if (result) await sim.loadResults();
  }

  return (
    <>
      <CoreActionIcon
        variant="subtle"
        color="violet"
        size="sm"
        title="Simulate event"
        onClick={handleOpen}
      >
        <MaterialIcon name="science" size={16} />
      </CoreActionIcon>

      <CoreModal
        opened={open}
        onClose={handleClose}
        title={
          <Inline gap="xs" align="center">
            <MaterialIcon name="science" size={18} />
            <Heading level={4}>Simulate: {eventName}</Heading>
          </Inline>
        }
        size="xl"
      >
        <Stack gap="md">
          {/* Options */}
          {!hasResults && !sim.resultsLoading && (
            <Stack gap="sm">
              <Text size="sm" c="dimmed">
                Shadow teams will play every TEAM stage in the event. The same teams carry across
                all stages.
              </Text>
              <CoreNumberInput
                label="Teams per size"
                description="Number of shadow teams generated per allowed team size"
                value={teamsPerSize}
                onChange={(v) => setTeamsPerSize(Number(v) || 3)}
                min={1}
                style={{ maxWidth: 200 }}
              />
            </Stack>
          )}

          {/* Run summary */}
          {sim.summary && (
            <Alert
              color={sim.summary.errors.length > 0 ? 'orange' : 'teal'}
              icon={
                <MaterialIcon
                  name={sim.summary.errors.length > 0 ? 'warning' : 'check_circle'}
                  size={16}
                />
              }
            >
              <Stack gap={4}>
                <Text size="sm" fw={600}>
                  Simulation complete — {sim.summary.stagesSimulated} stage
                  {sim.summary.stagesSimulated !== 1 ? 's' : ''} simulated, ingested{' '}
                  {sim.summary.ingested}, skipped {sim.summary.skipped}
                  {sim.summary.errors.length > 0 ? `, ${sim.summary.errors.length} error(s)` : ''}
                </Text>
                {sim.summary.errors.map((e, i) => (
                  <Text key={i} size="xs" c="red">
                    {e}
                  </Text>
                ))}
              </Stack>
            </Alert>
          )}

          {/* Error */}
          {sim.error && (
            <Alert color="red" icon={<MaterialIcon name="error" size={16} />}>
              {sim.error}
            </Alert>
          )}

          {/* Results */}
          {sim.resultsLoading && (
            <Stack gap="xs">
              <Skeleton height={32} />
              <Skeleton height={32} />
              <Skeleton height={32} />
            </Stack>
          )}

          {!sim.resultsLoading && sim.results && (
            <Stack gap="sm">
              <Inline justify="space-between" align="center">
                <Inline gap="xs" align="center">
                  <Text size="sm" fw={500}>
                    Results
                  </Text>
                  {hasResults && (
                    <Badge variant="light" color="violet" size="sm">
                      {sim.results.length} game{sim.results.length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </Inline>
                {hasResults && (
                  <Button
                    size="xs"
                    variant="subtle"
                    leftSection={<MaterialIcon name="download" size={14} />}
                    onClick={() => exportToCsv(eventName, sim.results!)}
                  >
                    Export CSV
                  </Button>
                )}
              </Inline>
              <EventSimulationResultsTable results={sim.results} />
            </Stack>
          )}

          {/* Action buttons */}
          <Group justify="space-between">
            <Group gap="xs">
              {hasResults && canRun && (
                <Button
                  size="sm"
                  variant="light"
                  color="red"
                  leftSection={<MaterialIcon name="delete_sweep" size={16} />}
                  onClick={sim.clearResults}
                >
                  Clear results
                </Button>
              )}
            </Group>
            <Group gap="xs">
              <Button
                size="sm"
                color="violet"
                loading={sim.running}
                disabled={!canRun || hasResults}
                leftSection={
                  !sim.running ? <MaterialIcon name="play_arrow" size={16} /> : undefined
                }
                onClick={handleRun}
              >
                {sim.running ? 'Simulating…' : hasResults ? 'Already run' : 'Run simulation'}
              </Button>
            </Group>
          </Group>
        </Stack>
      </CoreModal>
    </>
  );
}
