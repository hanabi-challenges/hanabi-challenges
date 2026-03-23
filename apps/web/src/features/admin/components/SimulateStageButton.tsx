// SimulateStageButton — per-stage simulation trigger in the admin stages page.
//
// TEAM stages (single-step):
//   1. Options form (teamsPerSize)
//   2. Run / Clear / Cancel controls
//   3. Results table + CSV export
//
// INDIVIDUAL stages (two-step, mirroring real queued flow):
//   Step 1 — Populate opt-ins: choose playerCount + sleepFraction, click
//             "Add players". Shadow players appear in the real opt-in list.
//   Step 2 — Run draw: host uses the normal draw UI to assign QUEUED teams.
//             A status badge shows opt-in / team counts. When teams > 0,
//             "Simulate games" becomes available.
//   Step 3 — Simulate games: awake QUEUED teams get games generated + ingested.
//             Results table + CSV export.

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
import type { StageSummary } from '../../../hooks/useStages';
import { useStageSimulation } from '../../../hooks/useSimulation';

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

function exportToCsv(stageName: string, results: ReturnType<typeof useStageSimulation>['results']) {
  if (!results || results.length === 0) return;

  const headers = [
    'Handling',
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
  link.download = `sim-${stageName.toLowerCase().replace(/\s+/g, '-')}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Results table
// ---------------------------------------------------------------------------

function SimulationResultsTable({
  results,
}: {
  results: NonNullable<ReturnType<typeof useStageSimulation>['results']>;
}) {
  if (results.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No simulation results found for this stage.
      </Text>
    );
  }

  return (
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
          {results.map((r) => (
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
                  c={r.bottom_deck_risk !== null && r.bottom_deck_risk > 0 ? 'orange' : undefined}
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
  );
}

// ---------------------------------------------------------------------------
// INDIVIDUAL stage stepped UI
// ---------------------------------------------------------------------------

function IndividualSimulation({
  sim,
  stage,
}: {
  sim: ReturnType<typeof useStageSimulation>;
  stage: StageSummary;
}) {
  const [playerCount, setPlayerCount] = useState(8);
  const [sleepPct, setSleepPct] = useState(20); // stored as 0–100

  const status = sim.status;
  const hasOptIns = (status?.optInCount ?? 0) > 0;
  const hasTeams = (status?.teamCount ?? 0) > 0;
  const hasResults = (sim.results?.length ?? 0) > 0;

  async function handleAddOptIns() {
    const result = await sim.simulateOptIns({
      playerCount,
      sleepFraction: sleepPct / 100,
    });
    if (result) await sim.loadStatus();
  }

  async function handleSimulateGames() {
    const result = await sim.simulateGames();
    if (result) await sim.loadResults();
  }

  // Determine which step we're on
  const step = hasResults ? 3 : hasTeams ? 2 : hasOptIns ? 1 : 0;

  return (
    <Stack gap="md">
      {/* Step indicators */}
      <Inline gap="sm" align="center">
        <Badge variant={step >= 0 ? 'filled' : 'outline'} color="violet" size="sm">
          Step 1
        </Badge>
        <Text size="xs" c="dimmed">
          Add players
        </Text>
        <Text size="xs" c="dimmed">
          →
        </Text>
        <Badge variant={step >= 1 ? 'filled' : 'outline'} color="violet" size="sm">
          Step 2
        </Badge>
        <Text size="xs" c="dimmed">
          Run draw
        </Text>
        <Text size="xs" c="dimmed">
          →
        </Text>
        <Badge variant={step >= 2 ? 'filled' : 'outline'} color="violet" size="sm">
          Step 3
        </Badge>
        <Text size="xs" c="dimmed">
          Simulate games
        </Text>
      </Inline>

      {/* Step 1: Opt-in options */}
      {step === 0 && (
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Shadow players will be added to the opt-in list. Some fraction will be "asleep" and
            won't make it onto teams. After adding players, run the draw from the stage page to
            assign QUEUED teams.
          </Text>
          <Group align="flex-end" gap="md">
            <CoreNumberInput
              label="Players"
              description="Total opt-in players"
              value={playerCount}
              onChange={(v) => setPlayerCount(Number(v) || 8)}
              min={2}
              max={64}
              style={{ maxWidth: 140 }}
            />
            <CoreNumberInput
              label="Asleep %"
              description="Won't play after draw"
              value={sleepPct}
              onChange={(v) => setSleepPct(Number(v) || 20)}
              min={0}
              max={90}
              style={{ maxWidth: 140 }}
            />
          </Group>
        </Stack>
      )}

      {/* Status badges (steps 1+) */}
      {hasOptIns && (
        <Inline gap="sm" align="center">
          <Inline gap="xs" align="center">
            <MaterialIcon name="people" size={14} />
            <Text size="sm">
              {status!.optInCount} opt-in{status!.optInCount !== 1 ? 's' : ''} added
            </Text>
          </Inline>
          {hasTeams && (
            <>
              <Text size="xs" c="dimmed">
                ·
              </Text>
              <Inline gap="xs" align="center">
                <MaterialIcon name="groups" size={14} />
                <Text size="sm">
                  {status!.teamCount} team{status!.teamCount !== 1 ? 's' : ''} formed
                </Text>
              </Inline>
            </>
          )}
        </Inline>
      )}

      {/* Step 2 guidance: waiting for draw */}
      {step === 1 && (
        <Alert color="blue" icon={<MaterialIcon name="info" size={16} />}>
          <Stack gap="xs">
            <Text size="sm">
              Players have been added to the opt-in list. Go to the <strong>stage page</strong> and
              run the draw to assign QUEUED teams. Then return here and click{' '}
              <strong>Refresh</strong> to continue.
            </Text>
            <Button
              size="xs"
              variant="light"
              color="blue"
              leftSection={<MaterialIcon name="refresh" size={14} />}
              loading={sim.statusLoading}
              onClick={sim.loadStatus}
            >
              Refresh
            </Button>
          </Stack>
        </Alert>
      )}

      {/* Opt-in summary after phase 1 */}
      {sim.optInSummary && (
        <Alert color="teal" icon={<MaterialIcon name="check_circle" size={16} />}>
          <Text size="sm" fw={600}>
            Added {sim.optInSummary.awake} awake + {sim.optInSummary.asleep} asleep players (
            {sim.optInSummary.total} total)
          </Text>
        </Alert>
      )}

      {/* Game simulation summary */}
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
              Simulation complete — ingested {sim.summary.ingested}, skipped {sim.summary.skipped}
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

      {!sim.resultsLoading && sim.results && hasResults && (
        <Stack gap="sm">
          <Inline justify="space-between" align="center">
            <Inline gap="xs" align="center">
              <Text size="sm" fw={500}>
                Results
              </Text>
              <Badge variant="light" color="violet" size="sm">
                {sim.results.length} game{sim.results.length !== 1 ? 's' : ''}
              </Badge>
            </Inline>
            <Button
              size="xs"
              variant="subtle"
              leftSection={<MaterialIcon name="download" size={14} />}
              onClick={() => exportToCsv(stage.label, sim.results)}
            >
              Export CSV
            </Button>
          </Inline>
          <SimulationResultsTable results={sim.results} />
        </Stack>
      )}

      {/* Action buttons */}
      <Group justify="space-between">
        <Group gap="xs">
          {(hasOptIns || hasResults) && !sim.running && (
            <Button
              size="sm"
              variant="light"
              color="red"
              leftSection={<MaterialIcon name="delete_sweep" size={16} />}
              onClick={async () => {
                const ok = await sim.clearResults();
                if (ok) await sim.loadStatus();
              }}
            >
              Clear all
            </Button>
          )}
        </Group>
        <Group gap="xs">
          {step === 0 && (
            <Button
              size="sm"
              color="violet"
              loading={sim.running}
              disabled={sim.running}
              leftSection={!sim.running ? <MaterialIcon name="person_add" size={16} /> : undefined}
              onClick={handleAddOptIns}
            >
              {sim.running ? 'Adding…' : 'Add players'}
            </Button>
          )}
          {step === 2 && !hasResults && (
            <Button
              size="sm"
              color="violet"
              loading={sim.running}
              disabled={sim.running}
              leftSection={!sim.running ? <MaterialIcon name="play_arrow" size={16} /> : undefined}
              onClick={handleSimulateGames}
            >
              {sim.running ? 'Simulating…' : 'Simulate games'}
            </Button>
          )}
          {step === 3 && (
            <Button size="sm" variant="light" color="gray" disabled>
              Complete
            </Button>
          )}
        </Group>
      </Group>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// TEAM stage UI (original single-step)
// ---------------------------------------------------------------------------

function TeamSimulation({
  sim,
  stage,
}: {
  sim: ReturnType<typeof useStageSimulation>;
  stage: StageSummary;
}) {
  const [teamsPerSize, setTeamsPerSize] = useState(3);

  const hasResults = (sim.results?.length ?? 0) > 0;
  const canRun = !sim.running && !sim.resultsLoading;

  async function handleRun() {
    const result = await sim.simulate({ teamsPerSize });
    if (result) await sim.loadResults();
  }

  return (
    <Stack gap="md">
      {/* Options */}
      {!hasResults && !sim.resultsLoading && (
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Shadow teams will be generated for each allowed team size. Each team plays every game
            slot within the stage window.
          </Text>
          <CoreNumberInput
            label="Teams per size"
            description="Number of compliant teams generated per allowed team size"
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
              Simulation complete — ingested {sim.summary.ingested}, skipped {sim.summary.skipped}
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

      {/* Results table */}
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
                onClick={() => exportToCsv(stage.label, sim.results)}
              >
                Export CSV
              </Button>
            )}
          </Inline>
          <SimulationResultsTable results={sim.results} />
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
            leftSection={!sim.running ? <MaterialIcon name="play_arrow" size={16} /> : undefined}
            onClick={handleRun}
          >
            {sim.running ? 'Simulating…' : hasResults ? 'Already run' : 'Run simulation'}
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// SimulateStageButton
// ---------------------------------------------------------------------------

export function SimulateStageButton({
  stage,
  eventSlug,
}: {
  stage: StageSummary;
  eventSlug: string;
}) {
  const [open, setOpen] = useState(false);

  const sim = useStageSimulation(eventSlug, stage.id);
  const isIndividual = stage.participation_type === 'INDIVIDUAL';

  async function handleOpen() {
    setOpen(true);
    if (isIndividual) {
      await Promise.all([sim.loadStatus(), sim.loadResults()]);
    } else {
      await sim.loadResults();
    }
  }

  function handleClose() {
    setOpen(false);
  }

  return (
    <>
      <CoreActionIcon
        variant="subtle"
        color="violet"
        size="sm"
        title="Simulate stage"
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
            <Heading level={4}>Simulate: {stage.label}</Heading>
          </Inline>
        }
        size="xl"
      >
        <Stack gap="sm">
          {isIndividual ? (
            <IndividualSimulation sim={sim} stage={stage} />
          ) : (
            <TeamSimulation sim={sim} stage={stage} />
          )}
        </Stack>
      </CoreModal>
    </>
  );
}
