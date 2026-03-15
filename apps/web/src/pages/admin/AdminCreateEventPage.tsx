import { useEffect, useState, type FormEvent } from 'react';
import {
  CoreAlert as Alert,
  CoreButton as Button,
  CoreCheckbox as Checkbox,
  CoreGroup as Group,
  CoreStack as Stack,
  CoreSwitch as Switch,
  CoreText as Text,
  CoreTextInput as TextInput,
  CoreTextarea as Textarea,
  DatePicker,
  FormContainer,
  InputContainer,
  PageHeader,
  SectionCard,
} from '../../design-system';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ApiError, getJsonAuth, postJsonAuth, putJsonAuth } from '../../lib/api';
import type { EventSummary } from '../../hooks/useEvents';

const TEAM_SIZES = [2, 3, 4, 5, 6] as const;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function dateToIso(date: string): string | null {
  if (!date) return null;
  return new Date(date).toISOString();
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
    longDescription: '',
    allowedTeamSizes: new Set([2]),
    combinedLeaderboard: false,
    registrationMode: 'ACTIVE',
    allowLateRegistration: true,
    registrationOpensAt: '',
    registrationCutoff: '',
    defaultVariantId: '',
    seedFormula: '',
  });
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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
          defaultVariantId: '',
          seedFormula: '',
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
      registration_opens_at: dateToIso(form.registrationOpensAt),
      registration_cutoff: dateToIso(form.registrationCutoff),
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
        if (msg.toLowerCase().includes('slug') || msg.toLowerCase().includes('unique')) {
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
              <InputContainer label="Registration Mode">
                <Group gap="md">
                  {(['ACTIVE', 'PASSIVE'] as const).map((mode) => (
                    <Checkbox
                      key={mode}
                      type="radio"
                      label={
                        mode === 'ACTIVE' ? 'Active (sign-up required)' : 'Passive (open to all)'
                      }
                      checked={form.registrationMode === mode}
                      onChange={() => setField('registrationMode', mode)}
                    />
                  ))}
                </Group>
              </InputContainer>

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

              <TextInput
                label="Default Variant ID"
                placeholder="e.g. 6"
                value={form.defaultVariantId}
                onChange={(e) =>
                  setField('defaultVariantId', e.currentTarget.value.replace(/\D/g, ''))
                }
              />

              <TextInput
                label="Seed Formula"
                placeholder="e.g. e{eID}s{sID}g{gID}"
                value={form.seedFormula}
                onChange={(e) => setField('seedFormula', e.currentTarget.value)}
                description="Available tokens: {eID}, {sID}, {gID}, {tSize}"
              />
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
    </Stack>
  );
}
