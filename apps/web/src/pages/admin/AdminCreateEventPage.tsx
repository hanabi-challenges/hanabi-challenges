import { useEffect, useState, type FormEvent } from 'react';
import {
  CoreActionIcon,
  CoreAlert as Alert,
  CoreButton as Button,
  CoreCheckbox as Checkbox,
  CoreGroup as Group,
  CoreModal,
  CoreNumberInput as NumberInput,
  CoreSelect,
  CoreStack as Stack,
  CoreSwitch as Switch,
  CoreText as Text,
  CoreTextInput as TextInput,
  CoreTextarea as Textarea,
  DatePicker,
  FormContainer,
  InputContainer,
  MaterialIcon,
  PageHeader,
  RadioGroup,
  SectionCard,
} from '../../design-system';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ApiError, getJsonAuth, postJsonAuth, putJsonAuth } from '../../lib/api';
import type { EventSummary } from '../../hooks/useEvents';
import { useVariants, variantSelectOptions } from '../../hooks/useVariants';

const TEAM_SIZES = [2, 3, 4, 5, 6] as const;

const DEFAULT_LONG_DESCRIPTION = `\
## About

_A brief paragraph describing the event — what it is, who it's for, and what makes it special._

## Format

_Describe how the event works:_

- **Team sizes:** _e.g. solo, 2-player, 3-player_
- **Stages:** _e.g. one round of 10 seeds, or qualifier → finals_
- **Scoring:** _e.g. cumulative score across all seeds; higher is better_
- **Variant:** _e.g. No Variant, or specify the deck_
- **Seeds:** _e.g. seeds are shared across all team sizes and released at the start of each round_

## Rules

- All games must be played on [hanab.live](https://hanab.live) using the specified seed.
- Results are pulled automatically once a game is completed. Contact an organizer if a result is missing.
- _Add any event-specific rules here — e.g. time limits, spectator policy, replays required._

## Schedule

| Milestone | Date |
|---|---|
| Registration opens | _TBD_ |
| Registration closes | _TBD_ |
| Event starts | _TBD_ |
| Event ends | _TBD_ |

## Registration

_Explain how to register — e.g. click Register above, or reach out to an organizer. Note any eligibility requirements._

## Organizers

_List the organizers and a contact method (Discord handle, etc.)._
`;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Date-only pickers return "YYYY-MM-DD". Spec: date-only strings are parsed as UTC midnight.
function dateToIsoStart(date: string): string | null {
  if (!date) return null;
  return `${date}T00:00:00.000Z`;
}

function dateToIsoEnd(date: string): string | null {
  if (!date) return null;
  return `${date}T23:59:59.000Z`;
}

function isoToDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 10);
}

type FormState = {
  name: string;
  slug: string;
  shortDescription: string;
  longDescription: string;
  allowedTeamSizes: Set<number>;
  combinedLeaderboard: boolean;
  registrationMode: 'ACTIVE' | 'PASSIVE';
  allowLateRegistration: boolean;
  registrationOpensAt: string;
  registrationCutoff: string;
  teamScope: 'EVENT' | 'STAGE';
  multiRegistration: 'ONE' | 'ONE_PER_SIZE' | 'UNRESTRICTED';
  autoPullEnabled: boolean;
  autoPullIntervalMinutes: string;
  defaultVariantId: string;
  seedFormula: string;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

export function AdminCreateEventPage() {
  const { slug: editSlug } = useParams<{ slug: string }>();
  const isEdit = Boolean(editSlug);
  const navigate = useNavigate();
  const { token } = useAuth();

  const [form, setForm] = useState<FormState>({
    name: '',
    slug: '',
    shortDescription: '',
    longDescription: DEFAULT_LONG_DESCRIPTION,
    allowedTeamSizes: new Set([2, 3, 4, 5, 6]),
    combinedLeaderboard: false,
    registrationMode: 'ACTIVE',
    allowLateRegistration: true,
    registrationOpensAt: '',
    registrationCutoff: '',
    teamScope: 'EVENT',
    multiRegistration: 'ONE_PER_SIZE',
    autoPullEnabled: false,
    autoPullIntervalMinutes: '60',
    defaultVariantId: '',
    seedFormula: '',
  });
  const { variants } = useVariants();
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [seedHelpOpen, setSeedHelpOpen] = useState(false);

  // Load existing event for edit mode
  useEffect(() => {
    if (!isEdit || !editSlug || !token) return;
    let cancelled = false;

    async function load() {
      try {
        const data = await getJsonAuth<EventSummary>(
          `/events/${encodeURIComponent(editSlug!)}`,
          token as string,
        );
        if (cancelled) return;
        setForm({
          name: data.name,
          slug: data.slug,
          shortDescription: data.short_description ?? '',
          longDescription: data.long_description,
          allowedTeamSizes: new Set(data.allowed_team_sizes),
          combinedLeaderboard: data.combined_leaderboard,
          registrationMode: data.registration_mode,
          allowLateRegistration: data.allow_late_registration,
          registrationOpensAt: isoToDate(data.registration_opens_at),
          registrationCutoff: isoToDate(data.registration_cutoff),
          teamScope: data.team_scope ?? 'EVENT',
          multiRegistration: data.multi_registration ?? 'ONE_PER_SIZE',
          autoPullEnabled: data.auto_pull_json?.enabled ?? false,
          autoPullIntervalMinutes: String(data.auto_pull_json?.interval_minutes ?? 60),
          defaultVariantId:
            data.variant_rule_json?.type === 'specific'
              ? String(data.variant_rule_json.variantId)
              : '',
          seedFormula: data.seed_rule_json?.formula ?? '',
        });
        setSlugManuallyEdited(true); // don't overwrite slug when editing name
      } catch {
        if (!cancelled) setLoadError('Failed to load event.');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [isEdit, editSlug, token]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function handleNameChange(value: string) {
    setField('name', value);
    if (!slugManuallyEdited) {
      setField('slug', slugify(value));
    }
  }

  function handleSlugChange(value: string) {
    setSlugManuallyEdited(true);
    setField('slug', value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
  }

  function toggleTeamSize(size: number) {
    setForm((prev) => {
      const next = new Set(prev.allowedTeamSizes);
      if (next.has(size)) {
        next.delete(size);
      } else {
        next.add(size);
      }
      return { ...prev, allowedTeamSizes: next };
    });
    setFieldErrors((prev) => ({ ...prev, allowedTeamSizes: undefined }));
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!form.name.trim()) errors.name = 'Name is required.';
    if (!form.slug.trim()) errors.slug = 'Slug is required.';
    else if (!/^[a-z0-9-]+$/.test(form.slug))
      errors.slug = 'Slug may only contain lowercase letters, numbers, and hyphens.';
    if (!form.longDescription.trim()) errors.longDescription = 'Long description is required.';
    if (form.allowedTeamSizes.size === 0)
      errors.allowedTeamSizes = 'Select at least one team size.';
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

    if (!token) return;

    const body = {
      name: form.name.trim(),
      ...(isEdit ? {} : { slug: form.slug.trim() }),
      short_description: form.shortDescription.trim() || null,
      long_description: form.longDescription.trim(),
      allowed_team_sizes: Array.from(form.allowedTeamSizes).sort((a, b) => a - b),
      combined_leaderboard: form.combinedLeaderboard,
      registration_mode: form.registrationMode,
      allow_late_registration: form.allowLateRegistration,
      registration_opens_at: dateToIsoStart(form.registrationOpensAt),
      registration_cutoff: dateToIsoEnd(form.registrationCutoff),
      team_scope: form.teamScope,
      multi_registration: form.multiRegistration,
      auto_pull_json: form.autoPullEnabled
        ? {
            enabled: true,
            interval_minutes: Math.max(1, parseInt(form.autoPullIntervalMinutes, 10) || 60),
          }
        : null,
      ...(form.defaultVariantId
        ? {
            variant_rule_json: {
              type: 'specific',
              variantId: parseInt(form.defaultVariantId, 10),
            },
          }
        : {}),
      ...(form.seedFormula.trim() ? { seed_rule_json: { formula: form.seedFormula.trim() } } : {}),
    };

    setSubmitting(true);
    try {
      const targetSlug = isEdit ? editSlug! : form.slug.trim();
      if (isEdit) {
        await putJsonAuth(`/events/${encodeURIComponent(targetSlug)}`, token, body);
      } else {
        await postJsonAuth('/events', token, body);
      }
      navigate(`/admin/events/${targetSlug}`);
    } catch (err) {
      if (err instanceof ApiError) {
        const msg = (err.body as { error?: string })?.error ?? 'Save failed.';
        if (msg === 'slug_taken' || msg.toLowerCase().includes('slug')) {
          setFieldErrors({ slug: 'This slug is already taken.' });
        } else {
          setApiError(msg);
        }
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

  return (
    <Stack gap="md">
      <PageHeader
        title={isEdit ? 'Edit Event' : 'Create Event'}
        subtitle={isEdit ? `Editing ${editSlug}` : 'Set up a new event.'}
        level={3}
      />

      {apiError ? (
        <Alert color="red" variant="light">
          {apiError}
        </Alert>
      ) : null}

      <form onSubmit={(e) => void handleSubmit(e)}>
        <FormContainer gap="lg">
          {/* Basic info */}
          <SectionCard>
            <FormContainer>
              <TextInput
                label="Name"
                placeholder="Event name"
                value={form.name}
                onChange={(e) => handleNameChange(e.currentTarget.value)}
                error={fieldErrors.name}
                required
              />

              <TextInput
                label="Slug"
                placeholder="event-slug"
                value={form.slug}
                onChange={(e) => handleSlugChange(e.currentTarget.value)}
                error={fieldErrors.slug}
                disabled={isEdit}
                description={isEdit ? 'Slug cannot be changed after creation.' : undefined}
                required
              />

              <TextInput
                label="Short Description"
                placeholder="One-line summary (optional)"
                value={form.shortDescription}
                onChange={(e) => setField('shortDescription', e.currentTarget.value)}
              />

              <Textarea
                label="Long Description"
                placeholder="Full event description (markdown supported)"
                value={form.longDescription}
                onChange={(e) => setField('longDescription', e.currentTarget.value)}
                error={fieldErrors.longDescription}
                minRows={4}
                required
              />
            </FormContainer>
          </SectionCard>

          {/* Team configuration */}
          <SectionCard>
            <FormContainer>
              <InputContainer
                label="Allowed Team Sizes"
                error={fieldErrors.allowedTeamSizes}
                helperText="Select at least one team size this event supports."
              >
                <Group gap="sm">
                  {TEAM_SIZES.map((size) => (
                    <Checkbox
                      key={size}
                      label={`${size}p`}
                      checked={form.allowedTeamSizes.has(size)}
                      onChange={() => toggleTeamSize(size)}
                    />
                  ))}
                </Group>
              </InputContainer>

              <Switch
                label="Combined Leaderboard"
                description="Show all team sizes in a single leaderboard."
                checked={form.combinedLeaderboard}
                onChange={(e) => setField('combinedLeaderboard', e.currentTarget.checked)}
              />
            </FormContainer>
          </SectionCard>

          {/* Registration */}
          <SectionCard>
            <FormContainer>
              <RadioGroup
                label="Multiple Registrations"
                value={form.multiRegistration}
                onChange={(v) =>
                  setField('multiRegistration', v as 'ONE' | 'ONE_PER_SIZE' | 'UNRESTRICTED')
                }
                options={[
                  { value: 'ONE', label: 'Only one (single registration per participant)' },
                  {
                    value: 'ONE_PER_SIZE',
                    label: 'One per team size (separate registration for each team size)',
                  },
                  { value: 'UNRESTRICTED', label: 'Unrestricted (no registration limit)' },
                ]}
              />

              <RadioGroup
                label="Registration Mode"
                value={form.registrationMode}
                onChange={(v) => setField('registrationMode', v as 'ACTIVE' | 'PASSIVE')}
                options={[
                  { value: 'ACTIVE', label: 'Active (sign-up required)' },
                  { value: 'PASSIVE', label: 'Passive (open to all)' },
                ]}
              />

              <Switch
                label="Allow Late Registration"
                description="Permit sign-ups after the registration cutoff."
                checked={form.allowLateRegistration}
                onChange={(e) => setField('allowLateRegistration', e.currentTarget.checked)}
              />

              <Group grow>
                <DatePicker
                  label="Registration Opens At"
                  value={form.registrationOpensAt}
                  onChange={(v) => setField('registrationOpensAt', v)}
                />
                <DatePicker
                  label="Registration Cutoff"
                  value={form.registrationCutoff}
                  onChange={(v) => setField('registrationCutoff', v)}
                />
              </Group>

              <Switch
                label="Automatically Pull Replays"
                description="Periodically ingest hanab.live replay results for this event's game slots."
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

          {/* Defaults (optional) */}
          <SectionCard>
            <FormContainer>
              <Text fw={600} size="sm">
                Propagation Defaults (optional)
              </Text>
              <Text size="sm" c="dimmed">
                These values propagate to new game slots unless overridden at the stage or game
                level.
              </Text>

              <RadioGroup
                label="Team Scope"
                value={form.teamScope}
                onChange={(v) => setField('teamScope', v as 'EVENT' | 'STAGE')}
                options={[
                  { value: 'EVENT', label: 'Event-wide (same team across all stages)' },
                  { value: 'STAGE', label: 'Stage-scoped (scope set at stage level)' },
                ]}
              />

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
              onClick={() => navigate(isEdit ? `/admin/events/${editSlug}` : '/admin/events')}
            >
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              {isEdit ? 'Save Changes' : 'Create Event'}
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
              <Group key={token} gap="sm" wrap="nowrap">
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
