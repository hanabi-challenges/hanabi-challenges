import { useState } from 'react';
import {
  Alert,
  SectionCard,
  CoreBadge as Badge,
  CoreButton as Button,
  CoreGrid as Grid,
  CoreGroup as Group,
  CoreModal as Modal,
  CoreNumberInput as NumberInput,
  CorePaper as Paper,
  CoreSimpleGrid as SimpleGrid,
  CoreStack as Stack,
  CoreText as Text,
  CoreTextInput as TextInput,
} from '../../../design-system';
import {
  defaultRoundPattern,
  normalizeRoundPattern,
  type RoundPattern,
  type StageForm,
} from './config';

type RoundPatternEditorProps = {
  value?: RoundPattern;
  onChange: (next: RoundPattern) => void;
};

function RoundPatternEditor({ value, onChange }: RoundPatternEditorProps) {
  const [showHelp, setShowHelp] = useState(false);
  const pattern = normalizeRoundPattern(value);
  const abbrHasInvalidChars = /[^A-Za-z0-9{}-]/.test(pattern.abbrPattern);

  const update = (patch: Partial<RoundPattern>) => {
    onChange(normalizeRoundPattern({ ...pattern, ...patch }));
  };

  return (
    <Stack gap="sm">
      {abbrHasInvalidChars && (
        <Alert color="red" variant="light" title="Invalid abbreviation pattern">
          Round abbreviations can only include letters, numbers, braces, and hyphens.
        </Alert>
      )}

      <Group align="flex-end" grow>
        <TextInput
          label="Round name pattern"
          value={pattern.namePattern}
          onChange={(e) => update({ namePattern: e.currentTarget.value })}
          rightSection={
            <Button variant="subtle" size="compact-xs" onClick={() => setShowHelp(true)}>
              Info
            </Button>
          }
        />
        <TextInput
          label="Round abbreviation pattern"
          value={pattern.abbrPattern}
          onChange={(e) => update({ abbrPattern: e.currentTarget.value })}
        />
      </Group>

      <Group grow>
        <NumberInput
          label="Days per round"
          min={1}
          value={pattern.playDays}
          onChange={(v) => update({ playDays: Number(v) || 1 })}
        />
        <NumberInput
          label="Gap days between rounds"
          min={0}
          value={pattern.gapDays}
          onChange={(v) => update({ gapDays: Number(v) || 0 })}
        />
      </Group>

      <TextInput
        label="Games per round (comma separated)"
        value={pattern.gamesPerRound}
        onChange={(e) => update({ gamesPerRound: e.currentTarget.value })}
      />

      <Modal opened={showHelp} onClose={() => setShowHelp(false)} title="Round naming patterns">
        <Stack gap="xs">
          <Text size="sm">Use tokens to generate names and abbreviations automatically.</Text>
          <Text size="sm">{`{i}`} = round index (1-based)</Text>
          <Text size="sm">{`{t}`} = teams remaining (if known)</Text>
          <Text size="sm">
            Example: {`Round {i}`} and {`R{i}`}
          </Text>
        </Stack>
      </Modal>
    </Stack>
  );
}

type BracketPreviewProps = {
  startDate?: string;
  roundPattern?: RoundPattern;
  maxTeams: number | null;
};

function BracketPreview({ startDate, roundPattern, maxTeams }: BracketPreviewProps) {
  const roundsCount = maxTeams ? Math.ceil(Math.log2(maxTeams)) : 7;
  const pattern = roundPattern ?? defaultRoundPattern;

  const gameCounts = pattern.gamesPerRound
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  const names = ['Round One', 'Round Two', 'Round Three', 'Round Four', 'Round Five', 'Round Six'];
  const rounds: { name: string; abbr: string; start: string; end: string; games: number }[] = [];

  let teamsRemaining = maxTeams ?? 0;
  let currentDate = startDate ? new Date(startDate) : null;

  for (let i = 0; i < roundsCount; i += 1) {
    const nameFromPattern = pattern.namePattern
      .replace('{i}', String(i + 1))
      .replace('{t}', teamsRemaining ? String(teamsRemaining) : '');

    const abbrFromPattern = pattern.abbrPattern
      .replace('{i}', String(i + 1))
      .replace('{t}', teamsRemaining ? String(teamsRemaining) : '');

    const displayName =
      pattern.namePattern.includes('{i}') || pattern.namePattern.includes('{t}')
        ? nameFromPattern
        : (names[i] ?? `Round ${i + 1}`);

    const games = gameCounts[i] ?? gameCounts[gameCounts.length - 1] ?? 1;

    let start = '';
    let end = '';

    if (currentDate) {
      const s = new Date(currentDate);
      const e = new Date(currentDate);
      e.setDate(e.getDate() + (pattern.playDays > 0 ? pattern.playDays - 1 : 0));
      start = s.toISOString().slice(0, 10);
      end = e.toISOString().slice(0, 10);

      currentDate = new Date(e);
      currentDate.setDate(currentDate.getDate() + (pattern.gapDays ?? 0) + 1);
      teamsRemaining =
        teamsRemaining > 0 ? Math.max(1, Math.ceil(teamsRemaining / 2)) : teamsRemaining;
    }

    rounds.push({ name: displayName, abbr: abbrFromPattern, start, end, games });
  }

  const visibleRounds =
    rounds.length >= 3 ? [rounds[0], rounds[1], rounds[rounds.length - 1]] : rounds;

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text fw={600}>Bracket Preview</Text>
        {maxTeams ? <Badge variant="light">Max teams: {maxTeams}</Badge> : null}
      </Group>

      {rounds.length === 0 ? (
        <Text size="sm" c="dimmed">
          Add a bracket start date to generate a schedule preview.
        </Text>
      ) : (
        <>
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            {visibleRounds.map((round, idx) => (
              <Paper withBorder radius="md" p="sm" key={`${round.name}-${idx}`}>
                <Stack gap={4}>
                  <Text size="sm">Name: {round.name}</Text>
                  <Text size="sm">Abbreviation: {round.abbr}</Text>
                  <Text size="sm">
                    Dates: {round.start && round.end ? `${round.start} -> ${round.end}` : 'TBD'}
                  </Text>
                  <Text size="sm">Games: {round.games}</Text>
                </Stack>
              </Paper>
            ))}
          </SimpleGrid>

          {rounds.length >= 3 && (
            <Text size="xs" c="dimmed">
              Showing first two rounds and final round.
            </Text>
          )}
        </>
      )}
    </Stack>
  );
}

type StageBlockProps = {
  stage: StageForm;
  index: number;
  parsedMaxTeams: number | null;
  seedingFormat: string;
  onPatch: (idx: number, patch: Partial<StageForm>) => void;
};

export function StageBlock({
  stage,
  index,
  parsedMaxTeams,
  seedingFormat,
  onPatch,
}: StageBlockProps) {
  const pillLabel =
    stage.stageType === 'ROUND_ROBIN'
      ? seedingFormat === 'groups'
        ? 'Group Stage'
        : 'Round Robin'
      : stage.stageType === 'BRACKET'
        ? 'Bracket'
        : 'Main Stage';

  return (
    <SectionCard>
      <Stack gap="sm">
        <Group justify="space-between">
          <Badge variant="light">{pillLabel}</Badge>
        </Group>

        {stage.stageType !== 'BRACKET' && (
          <Grid>
            <Grid.Col span={{ base: 12, sm: 5 }}>
              <TextInput
                type="date"
                label="Starts"
                value={stage.startsAt}
                onChange={(e) => onPatch(index, { startsAt: e.currentTarget.value })}
                disabled={!stage.timeBound}
                required={stage.timeBound}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 5 }}>
              <TextInput
                type="date"
                label="Ends"
                value={stage.endsAt}
                onChange={(e) => onPatch(index, { endsAt: e.currentTarget.value })}
                disabled={!stage.timeBound}
                required={stage.timeBound}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 2 }}>
              <NumberInput
                label="Games"
                min={1}
                value={stage.gameCount}
                onChange={(v) => onPatch(index, { gameCount: Number(v) || 1 })}
                required
              />
            </Grid.Col>
          </Grid>
        )}

        {stage.stageType === 'BRACKET' && (
          <Stack gap="sm">
            <Text fw={600}>Bracket rounds pattern</Text>
            <RoundPatternEditor
              value={stage.roundPattern}
              onChange={(next) => onPatch(index, { roundPattern: next })}
            />
            <BracketPreview
              startDate={stage.startsAt}
              roundPattern={stage.roundPattern}
              maxTeams={parsedMaxTeams}
            />
          </Stack>
        )}
      </Stack>
    </SectionCard>
  );
}
