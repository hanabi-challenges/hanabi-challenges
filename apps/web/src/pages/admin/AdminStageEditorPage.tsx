import { useEffect, useState, type FormEvent } from 'react';
import {
  CoreActionIcon,
  CoreAlert as Alert,
  CoreBadge as Badge,
  CoreButton as Button,
  CoreGroup as Group,
  CoreModal,
  CoreNumberInput as NumberInput,
  CoreSelect,
  CoreStack as Stack,
  CoreSwitch as Switch,
  CoreText as Text,
  CoreTextInput as TextInput,
  DatePicker,
  FormContainer,
  InputContainer,
  MaterialIcon,
  PageHeader,
  SectionCard,
} from '../../design-system';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ApiError, getJsonAuth, postJsonAuth, putJsonAuth } from '../../lib/api';
import type { StageSummary } from '../../hooks/useStages';
import type { EventSummary } from '../../hooks/useEvents';
import { useVariants, variantSelectOptions } from '../../hooks/useVariants';
import {
  ScoringChainEditor,
  DEFAULT_SCORING_CHAIN,
  type ScoringChainEntry,
} from '../../features/admin/components';

type Mechanism = 'SEEDED_LEADERBOARD' | 'GAUNTLET' | 'MATCH_PLAY';
type ParticipationType = 'INDIVIDUAL' | 'TEAM';
type TeamScope = 'EVENT' | 'STAGE';
type AttemptPolicy = 'SINGLE' | 'REQUIRED_ALL' | 'BEST_OF_N' | 'UNLIMITED_BEST';
type TimePolicy = 'WINDOW' | 'ROLLING' | 'SCHEDULED';
type StageScoringMethod = 'sum' | 'best_attempt' | 'win_loss' | 'elo';
type BracketType = 'SINGLE_ELIMINATION' | 'DOUBLE_ELIMINATION' | 'ROUND_ROBIN' | 'STEPLADDER';

function defaultStageScoringMethod(mechanism: Mechanism): StageScoringMethod {
  switch (mechanism) {
    case 'SEEDED_LEADERBOARD':
      return 'sum';
    case 'GAUNTLET':
      return 'best_attempt';
    case 'MATCH_PLAY':
      return 'win_loss';
  }
}

function stageScoringMethodOptions(mechanism: Mechanism): { value: string; label: string }[] {
  switch (mechanism) {
    case 'SEEDED_LEADERBOARD':
      return [{ value: 'sum', label: 'Sum of scores' }];
    case 'GAUNTLET':
      return [{ value: 'best_attempt', label: 'Best attempt' }];
    case 'MATCH_PLAY':
      return [
        { value: 'win_loss', label: 'Win/Loss record' },
        { value: 'elo', label: 'ELO rating' },
      ];
  }
}

type FormState = {
  label: string;
  mechanism: Mechanism;
  participation_type: ParticipationType;
  team_scope: TeamScope;
  attempt_policy: AttemptPolicy;
  time_policy: TimePolicy;
  bracket_type: BracketType | '';
  match_format_n: string;
  scoring_chain: ScoringChainEntry[];
  stage_scoring_method: StageScoringMethod;
  elo_k_factor: string;
  elo_participation_bonus: string;
  defaultVariantId: string;
  seedFormula: string;
  starts_at: string;
  ends_at: string;
  visible: boolean;
  autoPullEnabled: boolean;
  autoPullIntervalMinutes: string;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

function isoToDate(iso: string | Date | null): string {
  if (!iso) return '';
  return new Date(iso as string).toISOString().slice(0, 10);
}

function dateToIsoStart(date: string): string | null {
  if (!date) return null;
  return `${date}T00:00:00.000Z`;
}

function dateToIsoEnd(date: string): string | null {
  if (!date) return null;
  return `${date}T23:59:59.000Z`;
}

// ---------------------------------------------------------------------------
// AdminStageEditorPage
// ---------------------------------------------------------------------------

export function AdminStageEditorPage() {
  const { slug, stageId: stageIdParam } = useParams<{ slug: string; stageId: string }>();
  const isEdit = Boolean(stageIdParam);
  const navigate = useNavigate();
  const { token } = useAuth();

  const [form, setForm] = useState<FormState>({
    label: '',
    mechanism: 'SEEDED_LEADERBOARD',
    participation_type: 'TEAM',
    team_scope: 'EVENT',
    attempt_policy: 'SINGLE',
    time_policy: 'WINDOW',
    bracket_type: '',
    match_format_n: '1',
    scoring_chain: DEFAULT_SCORING_CHAIN,
    stage_scoring_method: 'sum',
    elo_k_factor: '32',
    elo_participation_bonus: '0',
    defaultVariantId: '',
    seedFormula: '',
    starts_at: '',
    ends_at: '',
    visible: false,
    autoPullEnabled: false,
    autoPullIntervalMinutes: '60',
  });
  const { variants } = useVariants();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [seedHelpOpen, setSeedHelpOpen] = useState(false);

  useEffect(() => {
    if (!isEdit || !stageIdParam || !slug || !token) return;
    let cancelled = false;

    async function load() {
      try {
        const data = await getJsonAuth<StageSummary>(
          `/events/${encodeURIComponent(slug!)}/stages/${stageIdParam}`,
          token as string,
        );
        if (cancelled) return;

        const gameScoringConfig = data.game_scoring_config_json as {
          chain?: ScoringChainEntry[];
        } | null;
        const stageScoringConfig = data.stage_scoring_config_json as {
          method?: string;
          k_factor?: number;
          participation_bonus?: number;
        } | null;
        const configJson = data.config_json as {
          bracket_type?: string;
          match_format?: string;
        } | null;
        const variantRule = data.variant_rule_json as {
          type?: string;
          variantId?: number;
        } | null;
        const seedRule = data.seed_rule_json as { formula?: string } | null;

        setForm({
          label: data.label,
          mechanism: data.mechanism,
          participation_type: data.participation_type,
          team_scope: data.team_scope,
          attempt_policy: data.attempt_policy,
          time_policy: data.time_policy,
          bracket_type: (configJson?.bracket_type ?? '') as BracketType | '',
          match_format_n: (() => {
            const fmt = configJson?.match_format;
            if (!fmt) return '1';
            if (Array.isArray(fmt)) return (fmt as number[]).join(',');
            const m = String(fmt).match(/^best_of_(\d+)$/);
            return m ? m[1] : '1';
          })(),
          scoring_chain: gameScoringConfig?.chain ?? DEFAULT_SCORING_CHAIN,
          stage_scoring_method: (stageScoringConfig?.method ??
            defaultStageScoringMethod(data.mechanism)) as StageScoringMethod,
          elo_k_factor: stageScoringConfig?.k_factor?.toString() ?? '32',
          elo_participation_bonus: stageScoringConfig?.participation_bonus?.toString() ?? '0',
          defaultVariantId: variantRule?.type === 'specific' ? String(variantRule.variantId) : '',
          seedFormula: seedRule?.formula ?? '',
          starts_at: isoToDate(data.starts_at),
          ends_at: isoToDate(data.ends_at),
          visible: data.visible,
          autoPullEnabled: data.auto_pull_json?.enabled ?? false,
          autoPullIntervalMinutes: String(data.auto_pull_json?.interval_minutes ?? 60),
        });
      } catch {
        if (!cancelled) setLoadError('Failed to load stage.');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [isEdit, stageIdParam, slug, token]);

  // When creating a new stage, seed team_scope from the event's propagation default.
  useEffect(() => {
    if (isEdit || !slug || !token) return;
    let cancelled = false;
    getJsonAuth<EventSummary>(`/events/${encodeURIComponent(slug)}`, token)
      .then((event) => {
        if (!cancelled && event.team_scope != null) {
          setForm((prev) => ({ ...prev, team_scope: event.team_scope as TeamScope }));
        }
      })
      .catch(() => {
        /* silently ignore — form keeps its default */
      });
    return () => {
      cancelled = true;
    };
  }, [isEdit, slug, token]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function handleMechanismChange(value: string) {
    const mech = value as Mechanism;
    setForm((prev) => ({
      ...prev,
      mechanism: mech,
      stage_scoring_method: defaultStageScoringMethod(mech),
    }));
    setFieldErrors((prev) => ({ ...prev, mechanism: undefined }));
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!form.label.trim()) errors.label = 'Label is required.';
    if (form.mechanism === 'MATCH_PLAY' && !form.bracket_type) {
      errors.bracket_type = 'Bracket type is required for Match Play.';
    }
    return errors;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setApiError(null);

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    if (!token || !slug) return;

    const game_scoring_config_json = { chain: form.scoring_chain };

    const stage_scoring_config_json: Record<string, unknown> = {
      method: form.stage_scoring_method,
    };
    if (form.stage_scoring_method === 'elo') {
      if (form.elo_k_factor) stage_scoring_config_json.k_factor = parseFloat(form.elo_k_factor);
      if (form.elo_participation_bonus)
        stage_scoring_config_json.participation_bonus = parseFloat(form.elo_participation_bonus);
    }

    const config_json: Record<string, unknown> = {};
    if (form.mechanism === 'MATCH_PLAY' && form.bracket_type) {
      config_json.bracket_type = form.bracket_type;
      // Support single value or comma-separated array
      const raw = form.match_format_n.trim();
      if (raw.includes(',')) {
        const parts = raw
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => Number.isFinite(n) && n >= 1);
        config_json.match_format = parts.length > 1 ? parts : `best_of_${parts[0] ?? 1}`;
      } else {
        const n = parseInt(raw, 10);
        config_json.match_format = `best_of_${Number.isFinite(n) && n >= 1 ? n : 1}`;
      }
    }

    const body: Record<string, unknown> = {
      label: form.label.trim(),
      participation_type: form.participation_type,
      team_scope: form.team_scope,
      attempt_policy: form.mechanism === 'MATCH_PLAY' ? 'SINGLE' : form.attempt_policy,
      time_policy: form.time_policy,
      game_scoring_config_json,
      stage_scoring_config_json,
      config_json,
      starts_at: dateToIsoStart(form.starts_at),
      ends_at: dateToIsoEnd(form.ends_at),
      visible: form.visible,
      auto_pull_json: form.autoPullEnabled
        ? {
            enabled: true,
            interval_minutes: Math.max(1, parseInt(form.autoPullIntervalMinutes, 10) || 60),
          }
        : null,
      ...(form.defaultVariantId
        ? {
            variant_rule_json: { type: 'specific', variantId: parseInt(form.defaultVariantId, 10) },
          }
        : {}),
      ...(form.seedFormula.trim() ? { seed_rule_json: { formula: form.seedFormula.trim() } } : {}),
    };

    if (!isEdit) {
      body.mechanism = form.mechanism;
    }

    setSubmitting(true);
    try {
      if (isEdit) {
        await putJsonAuth(
          `/events/${encodeURIComponent(slug)}/stages/${stageIdParam}`,
          token,
          body,
        );
      } else {
        await postJsonAuth(`/events/${encodeURIComponent(slug)}/stages`, token, body);
      }
      navigate(`/admin/events/${slug}/stages`);
    } catch (err) {
      if (err instanceof ApiError) {
        setApiError((err.body as { error?: string })?.error ?? 'Save failed.');
      } else {
        setApiError('An unexpected error occurred.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <Alert color="red" variant="light">
        {loadError}
      </Alert>
    );
  }

  const showAttemptPolicy = form.mechanism !== 'MATCH_PLAY';
  const showBracketConfig = form.mechanism === 'MATCH_PLAY';

  const chainHasMaxScore = form.scoring_chain.some(
    (e) => e.kind === 'observable' && e.type === 'max_score',
  );
  const scoringMethodOptions = chainHasMaxScore
    ? [{ value: 'sum', label: 'Count / Sum of max scores' }]
    : stageScoringMethodOptions(form.mechanism);

  return (
    <Stack gap="md">
      <PageHeader title={isEdit ? 'Edit Stage' : 'Add Stage'} level={3} />

      {apiError ? (
        <Alert color="red" variant="light">
          {apiError}
        </Alert>
      ) : null}

      <form onSubmit={(e) => void handleSubmit(e)}>
        <FormContainer gap="lg">
          {/* Core configuration */}
          <SectionCard>
            <FormContainer>
              <TextInput
                label="Label"
                placeholder="Stage name"
                value={form.label}
                onChange={(e) => setField('label', e.currentTarget.value)}
                error={fieldErrors.label}
                required
              />

              <CoreSelect
                label="Mechanism"
                value={form.mechanism}
                onChange={(v) => handleMechanismChange(v ?? 'SEEDED_LEADERBOARD')}
                disabled={isEdit}
                description={isEdit ? 'Mechanism cannot be changed after creation.' : undefined}
                data={[
                  { value: 'SEEDED_LEADERBOARD', label: 'Challenge' },
                  { value: 'GAUNTLET', label: 'Gauntlet' },
                  { value: 'MATCH_PLAY', label: 'Match Play' },
                ]}
                required
              />

              <CoreSelect
                label="Participation"
                value={form.participation_type}
                onChange={(v) => setField('participation_type', (v ?? 'TEAM') as ParticipationType)}
                data={[
                  { value: 'TEAM', label: 'Team — players register and compete as teams' },
                  {
                    value: 'INDIVIDUAL',
                    label: 'Individual — players opt in solo; teams assigned',
                  },
                ]}
                required
              />

              <CoreSelect
                label="Team Scope"
                value={form.team_scope}
                onChange={(v) => setField('team_scope', (v ?? 'EVENT') as TeamScope)}
                data={[
                  { value: 'EVENT', label: 'Event-wide (same team all stages)' },
                  { value: 'STAGE', label: 'Stage-scoped (new team per stage)' },
                ]}
                required
              />

              <CoreSelect
                label="Time Policy"
                value={form.time_policy}
                onChange={(v) => setField('time_policy', (v ?? 'WINDOW') as TimePolicy)}
                data={[
                  { value: 'WINDOW', label: 'Batch (all games open simultaneously)' },
                  { value: 'ROLLING', label: 'Sequential (games unlock in order)' },
                  { value: 'SCHEDULED', label: 'Custom Schedule (individual times per game)' },
                ]}
                required
              />

              {showAttemptPolicy ? (
                <CoreSelect
                  label="Attempt Policy"
                  value={form.attempt_policy}
                  onChange={(v) => setField('attempt_policy', (v ?? 'SINGLE') as AttemptPolicy)}
                  data={[
                    { value: 'SINGLE', label: 'Single (one attempt per game)' },
                    { value: 'REQUIRED_ALL', label: 'Required All (must complete all games)' },
                    { value: 'BEST_OF_N', label: 'Best of N (best N results count)' },
                    { value: 'UNLIMITED_BEST', label: 'Unlimited Best (best single attempt)' },
                  ]}
                  required
                />
              ) : null}

              {showBracketConfig ? (
                <>
                  <CoreSelect
                    label="Bracket Type"
                    value={form.bracket_type}
                    onChange={(v) => setField('bracket_type', (v ?? '') as BracketType | '')}
                    error={fieldErrors.bracket_type}
                    data={[
                      { value: 'SINGLE_ELIMINATION', label: 'Single Elimination' },
                      { value: 'DOUBLE_ELIMINATION', label: 'Double Elimination' },
                      { value: 'ROUND_ROBIN', label: 'Round Robin' },
                      { value: 'STEPLADDER', label: 'Stepladder' },
                    ]}
                    placeholder="Select bracket type"
                    required
                  />
                  <TextInput
                    label="Best of N (per round)"
                    description="Single value (e.g. 3) or comma-separated per round from first to final (e.g. 3,5,7)"
                    placeholder="e.g. 3 or 3,5,7"
                    value={form.match_format_n}
                    onChange={(e) =>
                      setField('match_format_n', e.currentTarget.value.replace(/[^0-9,]/g, ''))
                    }
                    error={fieldErrors.match_format_n}
                  />
                  {form.bracket_type === 'STEPLADDER' ? (
                    <Text size="sm" c="dimmed">
                      Stepladder: lowest-seeded players face off first; winner advances to face the
                      next seed up, continuing until reaching the top seed. Best of N can be a
                      single value (all rounds) or a comma-separated list per round from first match
                      to final (e.g., 3,5,7).
                    </Text>
                  ) : null}
                </>
              ) : null}

              {isEdit ? (
                <Group gap="xs">
                  <Badge color="gray" variant="light" size="sm">
                    Mechanism: {form.mechanism}
                  </Badge>
                </Group>
              ) : null}

              <Switch
                label="Visible to players"
                description="When off, this stage is hidden from the public event page."
                checked={form.visible}
                onChange={(e) => setField('visible', e.currentTarget.checked)}
              />
            </FormContainer>
          </SectionCard>

          {/* Timing */}
          <SectionCard>
            <FormContainer>
              <Group grow>
                <DatePicker
                  label="Starts At"
                  value={form.starts_at}
                  onChange={(v) => setField('starts_at', v)}
                />
                <DatePicker
                  label="Ends At"
                  value={form.ends_at}
                  onChange={(v) => setField('ends_at', v)}
                />
              </Group>

              <Switch
                label="Automatically Pull Replays"
                description="Periodically ingest hanab.live replay results for this stage's game slots. Overrides the event-level setting."
                checked={form.autoPullEnabled}
                onChange={(e) => setField('autoPullEnabled', e.currentTarget.checked)}
              />

              {form.autoPullEnabled ? (
                <NumberInput
                  label="Pull Interval (minutes)"
                  description="How often to check for new replays."
                  value={form.autoPullIntervalMinutes}
                  onChange={(v) => setField('autoPullIntervalMinutes', String(v))}
                  min={1}
                  step={15}
                />
              ) : null}
            </FormContainer>
          </SectionCard>

          {/* Scoring */}
          <SectionCard>
            <FormContainer>
              <Text fw={600} size="sm">
                Scoring Configuration
              </Text>

              <InputContainer
                label="Game Ranking Chain"
                helperText="Criteria applied in order to rank teams within each game. Drag to reorder. Observable fields are captured automatically from the replay; User Input fields must be submitted manually."
              >
                <ScoringChainEditor
                  value={form.scoring_chain}
                  onChange={(v) => {
                    setField('scoring_chain', v);
                    const nextHasMaxScore = v.some(
                      (e) => e.kind === 'observable' && e.type === 'max_score',
                    );
                    if (nextHasMaxScore) {
                      setField('stage_scoring_method', 'sum');
                    }
                  }}
                />
              </InputContainer>

              <CoreSelect
                label="Stage Scoring Method"
                value={form.stage_scoring_method}
                onChange={(v) =>
                  setField('stage_scoring_method', (v ?? 'sum') as StageScoringMethod)
                }
                data={scoringMethodOptions}
                required
              />

              {form.stage_scoring_method === 'elo' ? (
                <Group grow>
                  <TextInput
                    label="ELO K-Factor"
                    value={form.elo_k_factor}
                    onChange={(e) =>
                      setField('elo_k_factor', e.currentTarget.value.replace(/[^\d.]/g, ''))
                    }
                  />
                  <TextInput
                    label="Participation Bonus"
                    value={form.elo_participation_bonus}
                    onChange={(e) =>
                      setField(
                        'elo_participation_bonus',
                        e.currentTarget.value.replace(/[^\d.]/g, ''),
                      )
                    }
                  />
                </Group>
              ) : null}
            </FormContainer>
          </SectionCard>

          {/* Propagation defaults */}
          <SectionCard>
            <FormContainer>
              <Text fw={600} size="sm">
                Propagation Defaults (optional)
              </Text>
              <Text size="sm" c="dimmed">
                These values propagate to new game slots unless overridden at the game level.
              </Text>

              <CoreSelect
                label="Default Variant"
                placeholder="Search variants…"
                value={form.defaultVariantId}
                onChange={(v) => setField('defaultVariantId', v ?? '')}
                data={variantSelectOptions(variants)}
              />

              <Group gap="xs" align="flex-end">
                <TextInput
                  label="Seed Formula"
                  placeholder="e.g. e{eID}s{sID}g{gID}"
                  value={form.seedFormula}
                  onChange={(e) => setField('seedFormula', e.currentTarget.value)}
                  style={{ flex: 1 }}
                />
                <CoreActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  title="Seed formula help"
                  onClick={() => setSeedHelpOpen(true)}
                >
                  <MaterialIcon name="help_outline" size={16} />
                </CoreActionIcon>
              </Group>
            </FormContainer>
          </SectionCard>

          <Group justify="flex-end" gap="sm">
            <Button
              variant="default"
              type="button"
              onClick={() => navigate(`/admin/events/${slug}/stages`)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              {isEdit ? 'Save Changes' : 'Add Stage'}
            </Button>
          </Group>
        </FormContainer>
      </form>

      <CoreModal
        opened={seedHelpOpen}
        onClose={() => setSeedHelpOpen(false)}
        title="Seed Formula Tokens"
        size="md"
      >
        <Stack gap="sm">
          <Text size="sm">
            A seed formula is a template string that generates a unique seed for each game. Tokens
            are replaced with their numeric values at play time:
          </Text>
          <Stack gap="xs">
            {[
              { token: '{eID}', desc: 'Event ID' },
              { token: '{sID}', desc: 'Stage ID' },
              { token: '{gID}', desc: 'Game number (1-based position within stage)' },
              { token: '{mID}', desc: 'Match ID (Match Play only; empty when absent)' },
              { token: '{aID}', desc: 'Attempt ID (empty when absent)' },
              { token: '{tID}', desc: 'Team ID (empty when absent)' },
            ].map(({ token, desc }) => (
              <Group key={token} gap="sm" wrap={false}>
                <Text size="sm" ff="monospace" style={{ minWidth: 60 }}>
                  {token}
                </Text>
                <Text size="sm" c="dimmed">
                  {desc}
                </Text>
              </Group>
            ))}
          </Stack>
          <Text size="sm" fw={600}>
            Include a letter prefix before each token so seeds are self-labelling and unambiguous.
          </Text>
          <Text size="sm" c="dimmed">
            Example:{' '}
            <Text component="span" ff="monospace" size="sm">
              {'e{eID}s{sID}g{gID}'}
            </Text>{' '}
            produces{' '}
            <Text component="span" ff="monospace" size="sm">
              e1s3g1
            </Text>
            ,{' '}
            <Text component="span" ff="monospace" size="sm">
              e1s3g2
            </Text>
            , etc. Without prefixes,{' '}
            <Text component="span" ff="monospace" size="sm">
              {'{eID}{sID}{gID}'}
            </Text>{' '}
            would produce{' '}
            <Text component="span" ff="monospace" size="sm">
              130
            </Text>{' '}
            — ambiguous between event 1, stage 3, game 1 and event 13, stage 1, game *.
          </Text>
          <Text size="sm" fw={600}>
            For seeds to be unique, include at least{' '}
            <Text component="span" ff="monospace" size="sm">
              {'{sID}'}
            </Text>{' '}
            and{' '}
            <Text component="span" ff="monospace" size="sm">
              {'{gID}'}
            </Text>
            .
          </Text>
        </Stack>
      </CoreModal>
    </Stack>
  );
}
