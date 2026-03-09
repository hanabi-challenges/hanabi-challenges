import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Alert,
  ActionIcon,
  MaterialIcon,
  SectionCard,
  CoreBadge as Badge,
  CoreBox as Box,
  CoreButton as Button,
  CoreCheckbox as Checkbox,
  CoreCode as Code,
  CoreGrid as Grid,
  CoreGroup as Group,
  CoreImage as Image,
  CoreModal as Modal,
  CoreNumberInput as NumberInput,
  CoreRadio as Radio,
  CoreSelect as Select,
  CoreStack as Stack,
  CoreStepper as Stepper,
  CoreSwitch as Switch,
  CoreText as Text,
  CoreTextInput as TextInput,
  CoreTextarea as Textarea,
  CoreTitle as Title,
  CoreTooltip as Tooltip,
} from '../../design-system';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ApiError, getJson, getJsonAuth, postJsonAuth, putJsonAuth } from '../../lib/api';
import type { EventDetail } from '../../hooks/useEventDetail';
import { MarkdownRenderer } from '../../ui/MarkdownRenderer';
import {
  listBadgeSetsAuth,
  listEventBadgeLinksAuth,
  replaceEventBadgeLinksAuth,
  type BadgeSetRecord,
  updateChallengeBadgeConfigAuth,
} from './badgeSetsApi';
import { CoreCombobox as Combobox, useCoreCombobox as useCombobox } from '../../design-system';
import {
  CREATE_EVENT_WIZARD_DRAFT_KEY,
  initialStage,
  longDescriptionTemplateFor,
  normalizeRoundPattern,
  stagesEqual,
  steps,
  type CreateEventWizardDraft,
  type EventGameTemplate,
  type EventStage,
  type EventTypeLabel,
  type StageForm,
  type StepKey,
} from '../../features/admin/event-wizard/config';
import { StageBlock } from '../../features/admin/event-wizard/stageBlocks';
import {
  buildSeedsFromFormula,
  datesValid,
  extractApiErrorMessage,
  generateHashToken,
  getRoundIdForStage,
  getStageAbbrForSeeds,
  slugify,
} from '../../features/admin/event-wizard/helpers';

// Module-level cache so we only fetch once per page session.
let cachedVariants: string[] | null = null;

async function fetchHanabVariants(): Promise<string[]> {
  if (cachedVariants) return cachedVariants;
  const resp = await fetch('/api/variants');
  if (!resp.ok) throw new Error(`Failed to fetch variants (${resp.status})`);
  const data = (await resp.json()) as { variants: { name: string }[] };
  const sorted = data.variants.map((v) => v.name).sort((a, b) => a.localeCompare(b));
  cachedVariants = sorted;
  return sorted;
}

function VariantCombobox({
  value,
  onChange,
  variants,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  variants: string[];
  loading?: boolean;
}) {
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });
  const trimmed = value.toLowerCase().trim();
  const filtered = variants.filter((v) => v.toLowerCase().includes(trimmed));
  const exactMatch = variants.some((v) => v.toLowerCase() === trimmed);

  return (
    <Combobox
      store={combobox}
      onOptionSubmit={(v) => {
        onChange(v);
        combobox.closeDropdown();
      }}
    >
      <Combobox.Target>
        <TextInput
          label="Variant"
          value={value}
          placeholder={loading ? 'Loading variants…' : 'Search variants…'}
          onChange={(e) => {
            onChange(e.currentTarget.value);
            combobox.openDropdown();
            combobox.updateSelectedOptionIndex();
          }}
          onClick={() => combobox.openDropdown()}
          onFocus={() => combobox.openDropdown()}
          onBlur={() => combobox.closeDropdown()}
          required
        />
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options mah={260} style={{ overflowY: 'auto' }}>
          {loading && <Combobox.Empty>Loading…</Combobox.Empty>}
          {!loading && filtered.map((v) => (
            <Combobox.Option key={v} value={v}>
              {v}
            </Combobox.Option>
          ))}
          {!loading && filtered.length === 0 && value.trim() && !exactMatch && (
            <Combobox.Option value={value}>Use &quot;{value}&quot;</Combobox.Option>
          )}
          {!loading && filtered.length === 0 && !value.trim() && (
            <Combobox.Empty>No variants found</Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}

export function AdminCreateEventPage() {
  const { user, token } = useAuth();
  const { slug: editSlug } = useParams();
  const navigate = useNavigate();

  const isEdit = Boolean(editSlug);
  const isUnauthorized = !user || (user.role !== 'ADMIN' && user.role !== 'SUPERADMIN');

  const [name, setName] = useState('');
  const [eventType, setEventType] = useState<EventTypeLabel>('Challenge');
  const [eventStatus, setEventStatus] = useState<'DORMANT' | 'LIVE' | 'COMPLETE'>('DORMANT');
  const [eventAbbr, setEventAbbr] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [shortDescription, setShortDescription] = useState('');
  const [longDescription, setLongDescription] = useState(() =>
    longDescriptionTemplateFor('Challenge'),
  );
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const [seedingPlayEnabled, setSeedingPlayEnabled] = useState(false);
  const [seedingFormat, setSeedingFormat] = useState<'round_robin' | 'groups' | ''>('');
  const [maxTeams, setMaxTeams] = useState('');

  const [stages, setStages] = useState<StageForm[]>([initialStage()]);

  const [variant, setVariant] = useState('No Variant');
  const [seedCount, setSeedCount] = useState(100);
  const [seedFormula, setSeedFormula] = useState('{eID}-{i}');
  const [seedHashToken] = useState(() => generateHashToken());

  const [published, setPublished] = useState(false);
  const [badgeSets, setBadgeSets] = useState<BadgeSetRecord[]>([]);
  const [badgeSetsLoading, setBadgeSetsLoading] = useState(false);
  const [leagueSeasonBadgeSetId, setLeagueSeasonBadgeSetId] = useState<string | null>(null);
  const [leagueSessionBadgeSetId, setLeagueSessionBadgeSetId] = useState<string | null>(null);
  const [challengeBadgeSetId, setChallengeBadgeSetId] = useState<string | null>(null);
  const [allowLateRegistration, setAllowLateRegistration] = useState(true);
  const [registrationOpens, setRegistrationOpens] = useState('');
  const [registrationCutoff, setRegistrationCutoff] = useState('');
  const [enforceExactTeamSize, setEnforceExactTeamSize] = useState(false);

  const [currentStep, setCurrentStep] = useState<StepKey>('type');
  const [showPreview, setShowPreview] = useState(false);
  const [showFormulaHelp, setShowFormulaHelp] = useState(false);
  const [badgePreviewModal, setBadgePreviewModal] = useState<{
    title: string;
    svg: string;
  } | null>(null);

  const [saving, setSaving] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hanabVariants, setHanabVariants] = useState<string[]>([]);
  const [hanabVariantsLoading, setHanabVariantsLoading] = useState(false);

  const hasLoadedExisting = useRef(false);
  const prevEditSlugRef = useRef<string | undefined>(undefined);
  const previousEventTypeRef = useRef<EventTypeLabel>('Challenge');
  const hanabVariantsFetchInitiated = useRef(false);

  const isTournament = eventType === 'Tournament';
  const isSessionLadder = eventType === 'League';
  const isChallenge = eventType === 'Challenge';
  const hasBadgesStep = isSessionLadder || isChallenge;
  const parsedMaxTeams = maxTeams ? Number(maxTeams) : null;
  const stepByKey = useMemo(() => new Map(steps.map((step) => [step.key, step] as const)), []);
  const visibleSteps = useMemo(() => {
    if (isSessionLadder) {
      return ['type', 'event', 'badges']
        .map((key) => stepByKey.get(key as StepKey))
        .filter((step): step is { key: StepKey; label: string } => Boolean(step));
    }

    if (isChallenge) {
      return ['type', 'event', 'registration', 'templates', 'badges']
        .map((key) => stepByKey.get(key as StepKey))
        .filter((step): step is { key: StepKey; label: string } => Boolean(step));
    }

    return steps.filter((step) => step.key !== 'badges');
  }, [isSessionLadder, isChallenge, stepByKey]);

  const abbrHasSpace = /\s/.test(eventAbbr);
  const formulaHasSpace = /\s/.test(seedFormula);
  const formulaHasInvalidChars = !/^[A-Za-z0-9{}:_.-]+$/.test(seedFormula);

  const saveWizardDraft = useCallback(() => {
    if (isEdit || typeof window === 'undefined') return;

    const draft: CreateEventWizardDraft = {
      name,
      eventType,
      eventAbbr,
      slug,
      shortDescription,
      longDescription,
      startsAt,
      endsAt,
      published,
      seedingPlayEnabled,
      seedingFormat,
      maxTeams,
      stages,
      variant,
      seedCount,
      seedFormula,
      allowLateRegistration,
      registrationOpens,
      registrationCutoff,
      enforceExactTeamSize,
      challengeBadgeSetId,
      leagueSeasonBadgeSetId,
      leagueSessionBadgeSetId,
      currentStep,
    };

    window.localStorage.setItem(CREATE_EVENT_WIZARD_DRAFT_KEY, JSON.stringify(draft));
  }, [
    isEdit,
    name,
    eventType,
    eventAbbr,
    slug,
    shortDescription,
    longDescription,
    startsAt,
    endsAt,
    published,
    seedingPlayEnabled,
    seedingFormat,
    maxTeams,
    stages,
    variant,
    seedCount,
    seedFormula,
    allowLateRegistration,
    registrationOpens,
    registrationCutoff,
    enforceExactTeamSize,
    challengeBadgeSetId,
    leagueSeasonBadgeSetId,
    leagueSessionBadgeSetId,
    currentStep,
  ]);

  useEffect(() => {
    if (isEdit || typeof window === 'undefined') return;

    const raw = window.localStorage.getItem(CREATE_EVENT_WIZARD_DRAFT_KEY);
    if (!raw) return;

    try {
      const draft = JSON.parse(raw) as Partial<CreateEventWizardDraft>;
      if (!draft || typeof draft !== 'object') return;

      if (typeof draft.name === 'string') setName(draft.name);
      if (
        draft.eventType === 'Challenge' ||
        draft.eventType === 'Tournament' ||
        draft.eventType === 'League'
      ) {
        setEventType(draft.eventType);
      }
      if (typeof draft.eventAbbr === 'string') setEventAbbr(draft.eventAbbr);
      if (typeof draft.slug === 'string') {
        setSlug(draft.slug);
        setSlugEdited(true);
      }
      if (typeof draft.shortDescription === 'string') setShortDescription(draft.shortDescription);
      if (typeof draft.longDescription === 'string') setLongDescription(draft.longDescription);
      if (typeof draft.startsAt === 'string') setStartsAt(draft.startsAt);
      if (typeof draft.endsAt === 'string') setEndsAt(draft.endsAt);
      if (typeof draft.published === 'boolean') setPublished(draft.published);
      if (typeof draft.seedingPlayEnabled === 'boolean')
        setSeedingPlayEnabled(draft.seedingPlayEnabled);
      if (
        draft.seedingFormat === 'round_robin' ||
        draft.seedingFormat === 'groups' ||
        draft.seedingFormat === ''
      ) {
        setSeedingFormat(draft.seedingFormat);
      }
      if (typeof draft.maxTeams === 'string') setMaxTeams(draft.maxTeams);
      if (Array.isArray(draft.stages) && draft.stages.length > 0) {
        setStages(draft.stages as StageForm[]);
      }
      if (typeof draft.variant === 'string') setVariant(draft.variant);
      if (typeof draft.seedCount === 'number' && Number.isFinite(draft.seedCount)) {
        setSeedCount(Math.max(1, Math.floor(draft.seedCount)));
      }
      if (typeof draft.seedFormula === 'string') setSeedFormula(draft.seedFormula);
      if (typeof draft.allowLateRegistration === 'boolean') {
        setAllowLateRegistration(draft.allowLateRegistration);
      }
      if (typeof draft.registrationOpens === 'string')
        setRegistrationOpens(draft.registrationOpens);
      if (typeof draft.registrationCutoff === 'string')
        setRegistrationCutoff(draft.registrationCutoff);
      if (typeof draft.enforceExactTeamSize === 'boolean') {
        setEnforceExactTeamSize(draft.enforceExactTeamSize);
      }
      if (typeof draft.challengeBadgeSetId === 'string' || draft.challengeBadgeSetId === null) {
        setChallengeBadgeSetId(draft.challengeBadgeSetId ?? null);
      }
      if (
        typeof draft.leagueSeasonBadgeSetId === 'string' ||
        draft.leagueSeasonBadgeSetId === null
      ) {
        setLeagueSeasonBadgeSetId(draft.leagueSeasonBadgeSetId ?? null);
      }
      if (
        typeof draft.leagueSessionBadgeSetId === 'string' ||
        draft.leagueSessionBadgeSetId === null
      ) {
        setLeagueSessionBadgeSetId(draft.leagueSessionBadgeSetId ?? null);
      }
      if (
        draft.currentStep === 'type' ||
        draft.currentStep === 'event' ||
        draft.currentStep === 'badges' ||
        draft.currentStep === 'registration' ||
        draft.currentStep === 'stage' ||
        draft.currentStep === 'templates'
      ) {
        setCurrentStep(draft.currentStep);
      }
    } catch {
      // Ignore invalid local draft payloads.
    }
  }, [isEdit]);

  useEffect(() => {
    if (!slugEdited) {
      setSlug(slugify(name));
    }

    setStages((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      next[0] = { ...next[0], label: name };
      return next;
    });
  }, [name, slugEdited]);

  useEffect(() => {
    if (isTournament) {
      setAllowLateRegistration(false);
      setEnforceExactTeamSize(true);
    }
  }, [isTournament]);

  useEffect(() => {
    if (isEdit) {
      previousEventTypeRef.current = eventType;
      return;
    }

    const previousType = previousEventTypeRef.current;
    const previousTemplate = longDescriptionTemplateFor(previousType);
    const nextTemplate = longDescriptionTemplateFor(eventType);

    if (!longDescription.trim() || longDescription === previousTemplate) {
      setLongDescription(nextTemplate);
    }

    previousEventTypeRef.current = eventType;
  }, [eventType, isEdit, longDescription]);

  useEffect(() => {
    if (
      isSessionLadder &&
      (currentStep === 'registration' || currentStep === 'stage' || currentStep === 'templates')
    ) {
      setCurrentStep('event');
    }
  }, [isSessionLadder, currentStep]);

  useEffect(() => {
    if (!hasBadgesStep && currentStep === 'badges') {
      setCurrentStep('event');
    }
  }, [hasBadgesStep, currentStep]);

  useEffect(() => {
    if (eventType !== 'Challenge' && eventType !== 'League') return;

    setStages((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      next[0] = { ...next[0], abbr: eventAbbr };
      return next;
    });
  }, [eventAbbr, eventType]);

  useEffect(() => {
    const games = stages[0]?.gameCount;
    if (games != null) {
      setSeedCount(games);
    }
  }, [stages]);

  useEffect(() => {
    setStages((prev) => {
      const stage0 = prev[0];
      const stage1 = prev[1];
      const desired: StageForm[] = [];

      if (eventType === 'Tournament') {
        if (seedingPlayEnabled) {
          desired.push({
            label: seedingFormat === 'groups' ? 'Group Stage' : 'Round Robin',
            abbr: stage0?.abbr || eventAbbr || '',
            gameCount: stage0?.gameCount || 25,
            startsAt: stage0?.startsAt || startsAt,
            endsAt: stage0?.endsAt || endsAt,
            timeBound: stage0?.timeBound ?? Boolean(startsAt || endsAt),
            stageType: 'ROUND_ROBIN',
            roundPattern: normalizeRoundPattern(stage0?.roundPattern),
          });
        }

        desired.push({
          label: 'Bracket',
          abbr: stage1?.abbr || eventAbbr || '',
          gameCount: stage1?.gameCount || seedCount,
          startsAt: stage1?.startsAt || startsAt,
          endsAt: stage1?.endsAt || endsAt,
          timeBound: stage1?.timeBound ?? Boolean(startsAt || endsAt),
          stageType: 'BRACKET',
          roundPattern: normalizeRoundPattern(stage1?.roundPattern),
        });
      } else {
        desired.push({
          label: name,
          abbr: eventAbbr || '',
          gameCount: stage0?.gameCount || seedCount,
          startsAt: stage0?.startsAt || startsAt,
          endsAt: stage0?.endsAt || endsAt,
          timeBound: stage0?.timeBound ?? Boolean(startsAt || endsAt),
          stageType: 'SINGLE',
          roundPattern: normalizeRoundPattern(stage0?.roundPattern),
        });
      }

      const next = desired.map((desiredStage, idx) => {
        const existing = prev[idx];
        return {
          ...desiredStage,
          label: desiredStage.label || existing?.label || '',
          abbr: desiredStage.abbr || existing?.abbr || '',
          gameCount: existing?.gameCount ?? desiredStage.gameCount,
          startsAt: existing?.startsAt ?? desiredStage.startsAt,
          endsAt: existing?.endsAt ?? desiredStage.endsAt,
          timeBound: existing?.timeBound ?? desiredStage.timeBound,
          roundPattern: existing?.roundPattern ?? desiredStage.roundPattern,
        };
      });

      const unchanged =
        next.length === prev.length && next.every((stage, idx) => stagesEqual(stage, prev[idx]));

      return unchanged ? prev : next;
    });
  }, [eventType, seedingPlayEnabled, seedingFormat, eventAbbr, name, startsAt, endsAt, seedCount]);

  useEffect(() => {
    if (endsAt && !registrationCutoff) {
      setRegistrationCutoff(endsAt);
    }
  }, [endsAt, registrationCutoff]);

  useEffect(() => {
    if (startsAt && !registrationOpens) {
      setRegistrationOpens(startsAt);
    }
  }, [startsAt, registrationOpens]);

  useEffect(() => {
    if (!token || isUnauthorized) return;

    let cancelled = false;
    const loadBadgeSets = async () => {
      try {
        setBadgeSetsLoading(true);
        const sets = await listBadgeSetsAuth(token);
        if (!cancelled) {
          setBadgeSets(sets);
        }
      } catch {
        if (!cancelled) {
          setBadgeSets([]);
        }
      } finally {
        if (!cancelled) {
          setBadgeSetsLoading(false);
        }
      }
    };

    void loadBadgeSets();
    return () => {
      cancelled = true;
    };
  }, [token, isUnauthorized]);

  useEffect(() => {
    if (currentStep !== 'templates' || isSessionLadder) return;
    if (hanabVariants.length > 0 || hanabVariantsFetchInitiated.current) return;
    hanabVariantsFetchInitiated.current = true;
    const load = async () => {
      setHanabVariantsLoading(true);
      try {
        const variants = await fetchHanabVariants();
        setHanabVariants(variants);
      } catch {
        // fall through — user can still type a custom value
      } finally {
        setHanabVariantsLoading(false);
      }
    };
    void load();
  }, [currentStep, isSessionLadder, hanabVariants.length]);

  useEffect(() => {
    if (!isEdit || !editSlug) return;

    if (prevEditSlugRef.current !== editSlug) {
      prevEditSlugRef.current = editSlug;
      hasLoadedExisting.current = false;
    }

    if (hasLoadedExisting.current) return;

    const load = async () => {
      setLoadingExisting(true);
      setError(null);

      if (!token) {
        setError('Missing auth token');
        setLoadingExisting(false);
        return;
      }

      try {
        const event = await getJsonAuth<EventDetail>(`/events/${editSlug}`, token);

        setName(event.name);
        setSlug(event.slug);
        setShortDescription(event.short_description || '');
        setLongDescription(event.long_description || '');

        const evStart = event.starts_at ? event.starts_at.slice(0, 10) : '';
        const evEnd = event.ends_at ? event.ends_at.slice(0, 10) : '';

        setStartsAt(evStart);
        setEndsAt(evEnd);
        setPublished(event.published ?? false);

        const format =
          event.event_format === 'tournament'
            ? 'tournament'
            : event.event_format === 'session_ladder'
              ? 'session_ladder'
              : 'challenge';
        setEventType(
          format === 'tournament'
            ? 'Tournament'
            : format === 'session_ladder'
              ? 'League'
              : 'Challenge',
        );
        setEventStatus(event.event_status ?? 'DORMANT');
        setSeedingPlayEnabled(Boolean(event.round_robin_enabled));
        setSeedingFormat(event.round_robin_enabled ? 'round_robin' : '');
        setMaxTeams(event.max_teams ? String(event.max_teams) : '');
        setAllowLateRegistration(
          format === 'tournament' ? false : (event.allow_late_registration ?? true),
        );
        setRegistrationOpens(
          event.registration_opens_at ? event.registration_opens_at.slice(0, 10) : evStart,
        );
        setRegistrationCutoff(
          event.registration_cutoff ? event.registration_cutoff.slice(0, 10) : '',
        );

        const loadedStages = await getJson<EventStage[]>(`/events/${editSlug}/stages`);
        if (loadedStages.length > 0) {
          const mapped = loadedStages.map((stage) => {
            const config = (stage.config_json ?? {}) as {
              stage_abbreviation?: string;
              event_abbreviation?: string;
              bracket_round_pattern?: {
                name_pattern?: string;
                abbr_pattern?: string;
                play_days?: number;
                gap_days?: number;
                games_per_round?: string;
              };
            };

            const stStart = stage.starts_at ? stage.starts_at.slice(0, 10) : '';
            const stEnd = stage.ends_at ? stage.ends_at.slice(0, 10) : '';
            const pattern = config.bracket_round_pattern;

            return {
              id: stage.event_stage_id,
              label: stage.label,
              abbr: config.stage_abbreviation || config.event_abbreviation || '',
              gameCount: seedCount,
              startsAt: stStart,
              endsAt: stEnd,
              timeBound: Boolean(stStart || stEnd),
              stageType: stage.stage_type,
              roundPattern:
                stage.stage_type === 'BRACKET'
                  ? normalizeRoundPattern({
                      namePattern: pattern?.name_pattern,
                      abbrPattern: pattern?.abbr_pattern,
                      playDays: pattern?.play_days,
                      gapDays: pattern?.gap_days,
                      gamesPerRound: pattern?.games_per_round,
                    })
                  : undefined,
            } as StageForm;
          });

          setStages(mapped.length > 0 ? mapped : [initialStage()]);

          const enforce =
            ((loadedStages[0]?.config_json ?? {}) as { enforce_exact_team_size?: boolean })
              .enforce_exact_team_size ?? false;

          setEnforceExactTeamSize(format === 'tournament' ? true : !!enforce);
        }

        const templates = await getJson<EventGameTemplate[]>(`/events/${editSlug}/game-templates`);
        if (templates.length > 0) {
          setVariant(templates[0].variant || 'No Variant');
          setSeedCount(templates.length);
          setStages((prev) => {
            if (prev.length === 0) return prev;
            const next = [...prev];
            next[0] = { ...next[0], gameCount: templates.length };
            return next;
          });
        }

        const badgeLinks = await listEventBadgeLinksAuth(token, editSlug);
        const challengeLink = badgeLinks.find((link) => link.purpose === 'challenge_overall');
        const seasonLink = badgeLinks.find((link) => link.purpose === 'season_overall');
        const sessionLink = badgeLinks.find((link) => link.purpose === 'session_winner');
        setChallengeBadgeSetId(challengeLink ? String(challengeLink.badge_set_id) : null);
        setLeagueSeasonBadgeSetId(seasonLink ? String(seasonLink.badge_set_id) : null);
        setLeagueSessionBadgeSetId(sessionLink ? String(sessionLink.badge_set_id) : null);
        setCurrentStep('event');
      } catch (err) {
        if (err instanceof ApiError) {
          setError(`Failed to load event for editing: ${extractApiErrorMessage(err)}`);
        } else {
          setError(
            `Failed to load event for editing${err instanceof Error ? `: ${err.message}` : ''}`,
          );
        }
      } finally {
        hasLoadedExisting.current = true;
        setLoadingExisting(false);
      }
    };

    void load();
  }, [isEdit, editSlug, token, seedCount]);

  const invalidTokens = useMemo(() => {
    const matches = [...seedFormula.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    return matches.filter(
      (tok) =>
        tok !== 'eID' &&
        tok !== 'sID' &&
        tok !== 'rID' &&
        tok !== 'i' &&
        tok !== 'hash' &&
        !/^0+i$/.test(tok),
    );
  }, [seedFormula]);

  const requiredTokensMissing = useMemo(() => {
    const needed = ['eID', 'i'];
    if (isTournament) needed.push('rID');

    const present = new Set([...seedFormula.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]));
    return needed.filter((tok) => !present.has(tok));
  }, [seedFormula, isTournament]);

  useEffect(() => {
    if (!isTournament) return;
    setSeedFormula((prev) => {
      if (prev.includes('{rID}')) return prev;
      if (prev.includes('{i}')) return prev.replace('{i}', '{rID}-{i}');
      return `${prev}-{rID}`;
    });
  }, [isTournament]);

  const seedPreview = useMemo(() => {
    const activeStageAbbr = getStageAbbrForSeeds(stages[0], eventAbbr, parsedMaxTeams);
    const rId = getRoundIdForStage(stages[0], 0);
    const seeds = buildSeedsFromFormula(
      seedFormula,
      eventAbbr,
      activeStageAbbr,
      rId,
      seedCount,
      seedHashToken,
    );

    const first = seeds.slice(0, 3);
    const last = seeds.slice(-3);
    return seeds.length > 6 ? [...first, '...', ...last] : seeds;
  }, [seedFormula, eventAbbr, stages, seedCount, seedHashToken, parsedMaxTeams]);

  const seedsHaveInvalidChars = useMemo(() => {
    const activeStageAbbr = getStageAbbrForSeeds(stages[0], eventAbbr, parsedMaxTeams);
    const rId = getRoundIdForStage(stages[0], 0);
    const seeds = buildSeedsFromFormula(
      seedFormula,
      eventAbbr,
      activeStageAbbr,
      rId,
      Math.min(seedCount, 10),
      seedHashToken,
    );

    return seeds.some((s) => !/^[A-Za-z0-9-]+$/.test(s));
  }, [seedFormula, eventAbbr, stages, seedCount, seedHashToken, parsedMaxTeams]);

  const duplicateSeedsError = useMemo(() => {
    const allSeeds: string[] = [];

    stages.forEach((stage, idx) => {
      const stageAbbr = getStageAbbrForSeeds(stage, eventAbbr, parsedMaxTeams);
      const rId = getRoundIdForStage(stage, idx);
      const seeds = buildSeedsFromFormula(
        seedFormula,
        eventAbbr,
        stageAbbr,
        rId,
        stage.gameCount,
        seedHashToken,
      );
      allSeeds.push(...seeds);
    });

    const seen = new Set<string>();
    for (const seed of allSeeds) {
      if (seen.has(seed)) {
        return 'Seed pattern creates duplicate values. Include round and game tokens.';
      }
      seen.add(seed);
    }

    return null;
  }, [stages, seedFormula, eventAbbr, parsedMaxTeams, seedHashToken]);

  const tournamentLimitError = useMemo(() => {
    if (!isTournament) return null;

    if (
      !maxTeams.trim() ||
      parsedMaxTeams == null ||
      Number.isNaN(parsedMaxTeams) ||
      parsedMaxTeams <= 0
    ) {
      return 'Select a valid max teams value for tournaments.';
    }

    if (seedingPlayEnabled && !seedingFormat) {
      return 'Choose a seeding format.';
    }

    return null;
  }, [isTournament, maxTeams, parsedMaxTeams, seedingPlayEnabled, seedingFormat]);

  const badgeSelectData = useMemo(() => {
    const activeSelections = new Set(
      [challengeBadgeSetId, leagueSeasonBadgeSetId, leagueSessionBadgeSetId]
        .filter(Boolean)
        .map((value) => Number(value)),
    );

    return badgeSets
      .filter((set) => {
        const attachedElsewhere = (set.attachments ?? []).some(
          (attachment) => attachment.event_slug !== editSlug,
        );
        if (!attachedElsewhere) return true;
        return activeSelections.has(set.id);
      })
      .map((set) => ({ value: String(set.id), label: set.name }));
  }, [badgeSets, challengeBadgeSetId, leagueSeasonBadgeSetId, leagueSessionBadgeSetId, editSlug]);

  const challengeBadgePreview = useMemo(
    () => badgeSets.find((set) => String(set.id) === challengeBadgeSetId)?.preview_svg ?? null,
    [badgeSets, challengeBadgeSetId],
  );
  const leagueSeasonBadgePreview = useMemo(
    () => badgeSets.find((set) => String(set.id) === leagueSeasonBadgeSetId)?.preview_svg ?? null,
    [badgeSets, leagueSeasonBadgeSetId],
  );
  const leagueSessionBadgePreview = useMemo(
    () => badgeSets.find((set) => String(set.id) === leagueSessionBadgeSetId)?.preview_svg ?? null,
    [badgeSets, leagueSessionBadgeSetId],
  );

  const openBadgePreview = useCallback((title: string, svg: string | null) => {
    if (!svg) return;
    setBadgePreviewModal({ title, svg });
  }, []);

  const eventValid =
    Boolean(name) &&
    Boolean(slug) &&
    Boolean(longDescription) &&
    Boolean(eventAbbr) &&
    !abbrHasSpace &&
    !tournamentLimitError;

  const stageValid =
    isSessionLadder || isChallenge
      ? true
      : stages.length > 0 &&
        stages.every((stage) => {
          const hasSpace = /\s/.test(stage.abbr);
          return (
            Boolean(stage.label) &&
            Boolean(stage.abbr) &&
            !hasSpace &&
            stage.gameCount > 0 &&
            (stage.timeBound ? datesValid(stage.startsAt, stage.endsAt) : true)
          );
        });

  const templatesValid = isSessionLadder
    ? true
    : Boolean(variant) &&
      seedCount >= 1 &&
      Boolean(seedFormula.trim()) &&
      !formulaHasSpace &&
      !formulaHasInvalidChars &&
      invalidTokens.length === 0 &&
      requiredTokensMissing.length === 0 &&
      !seedsHaveInvalidChars &&
      !duplicateSeedsError;

  const registrationValid = isTournament ? Boolean(registrationOpens && registrationCutoff) : true;
  const badgesValid = true;

  const stepValid = (key: StepKey) => {
    if (key === 'type') return Boolean(eventType);
    if (key === 'event') return eventValid;
    if (key === 'badges') return badgesValid;
    if (key === 'registration') return registrationValid;
    if (key === 'stage') return stageValid;
    return templatesValid;
  };

  const stepOrder: StepKey[] = visibleSteps.map((step) => step.key);
  const currentIndex = stepOrder.indexOf(currentStep);
  const activeStepIndex = Math.max(0, currentIndex === -1 ? 0 : currentIndex);

  useEffect(() => {
    if (stepOrder.length === 0) return;
    if (!stepOrder.includes(currentStep)) {
      setCurrentStep(stepOrder[0]);
    }
  }, [stepOrder, currentStep]);

  const onNext = () => {
    if (!stepValid(currentStep)) return;
    const next = stepOrder[currentIndex + 1];
    if (next) setCurrentStep(next);
  };

  const onPrev = () => {
    const prev = stepOrder[currentIndex - 1];
    if (prev) setCurrentStep(prev);
  };

  const resetForm = () => {
    setName('');
    setEventType('Challenge');
    setEventStatus('DORMANT');
    setEventAbbr('');
    setSlug('');
    setSlugEdited(false);
    setShortDescription('');
    setLongDescription(longDescriptionTemplateFor('Challenge'));
    setStartsAt('');
    setEndsAt('');
    setStages([initialStage()]);
    setVariant('No Variant');
    setSeedCount(100);
    setSeedFormula('{eID}-{i}');
    setSeedingPlayEnabled(false);
    setSeedingFormat('');
    setMaxTeams('');
    setPublished(false);
    setChallengeBadgeSetId(null);
    setLeagueSeasonBadgeSetId(null);
    setLeagueSessionBadgeSetId(null);
    setAllowLateRegistration(true);
    setRegistrationOpens('');
    setRegistrationCutoff('');
    setEnforceExactTeamSize(false);
    setCurrentStep('type');
    previousEventTypeRef.current = 'Challenge';
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(CREATE_EVENT_WIZARD_DRAFT_KEY);
    }
  };

  const updateStage = (index: number, patch: Partial<StageForm>) => {
    setStages((prev) => prev.map((stage, idx) => (idx === index ? { ...stage, ...patch } : stage)));
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!user || !token) return;
    if (!eventValid || !badgesValid || !stageValid || !templatesValid || !registrationValid) return;

    setSaving(true);
    setMessage(null);
    setError(null);

    const eventFormat = isSessionLadder
      ? 'session_ladder'
      : isTournament
        ? 'tournament'
        : 'challenge';
    const payloadEventStatus = isEdit ? eventStatus : 'DORMANT';
    const payloadStartsAt = isSessionLadder ? null : startsAt ? `${startsAt}T12:00:00Z` : null;
    const payloadEndsAt = isSessionLadder ? null : endsAt ? `${endsAt}T23:59:59Z` : null;
    const payloadMaxTeams = isTournament ? parsedMaxTeams : null;
    const payloadMaxRounds = null;
    const payloadAllowLate = isTournament ? false : allowLateRegistration;

    const registrationOpensAt = registrationOpens ? `${registrationOpens}T00:00:00Z` : null;

    try {
      let targetSlug = slug;
      if (isEdit && editSlug) {
        await putJsonAuth(`/events/${encodeURIComponent(editSlug)}`, token, {
          name,
          new_slug: slug,
          short_description: shortDescription || null,
          long_description: longDescription,
          published,
          event_format: eventFormat,
          event_status: payloadEventStatus,
          round_robin_enabled: seedingPlayEnabled && seedingFormat === 'round_robin',
          max_teams: payloadMaxTeams,
          max_rounds: payloadMaxRounds,
          allow_late_registration: payloadAllowLate,
          registration_opens_at: registrationOpensAt,
          registration_cutoff: registrationCutoff || null,
          starts_at: payloadStartsAt,
          ends_at: payloadEndsAt,
        });
        targetSlug = slug;
      } else {
        const created = await postJsonAuth<{ slug?: string }>('/events', token, {
          name,
          slug,
          short_description: shortDescription || null,
          long_description: longDescription,
          published,
          event_format: eventFormat,
          event_status: payloadEventStatus,
          round_robin_enabled: seedingPlayEnabled && seedingFormat === 'round_robin',
          max_teams: payloadMaxTeams,
          max_rounds: payloadMaxRounds,
          allow_late_registration: payloadAllowLate,
          registration_opens_at: registrationOpensAt,
          registration_cutoff: registrationCutoff || null,
          starts_at: payloadStartsAt,
          ends_at: payloadEndsAt,
        });
        targetSlug = created?.slug || slug;
      }

      if (hasBadgesStep) {
        const links: Array<{
          badge_set_id: number;
          purpose: 'season_overall' | 'session_winner' | 'challenge_overall';
          sort_order: number;
        }> = [];

        if (isSessionLadder) {
          if (leagueSeasonBadgeSetId) {
            const parsed = Number(leagueSeasonBadgeSetId);
            if (Number.isInteger(parsed) && parsed > 0) {
              links.push({ badge_set_id: parsed, purpose: 'season_overall', sort_order: 0 });
            }
          }
          if (leagueSessionBadgeSetId) {
            const parsed = Number(leagueSessionBadgeSetId);
            if (Number.isInteger(parsed) && parsed > 0) {
              links.push({ badge_set_id: parsed, purpose: 'session_winner', sort_order: 1 });
            }
          }
        }

        if (isChallenge && challengeBadgeSetId) {
          const parsed = Number(challengeBadgeSetId);
          if (Number.isInteger(parsed) && parsed > 0) {
            links.push({ badge_set_id: parsed, purpose: 'challenge_overall', sort_order: 0 });
          }
        }

        await replaceEventBadgeLinksAuth(token, targetSlug, links);

        if (isChallenge) {
          await updateChallengeBadgeConfigAuth(token, targetSlug, {
            podium_enabled: true,
            completion_enabled: true,
            completion_requires_deadline: false,
          });
        }
      }

      if (!isEdit && !isSessionLadder) {
        for (let idx = 0; idx < stages.length; idx += 1) {
          const stage = stages[idx];
          const stagePayload = await postJsonAuth<{ event_stage_id: number }>(
            `/events/${encodeURIComponent(targetSlug)}/stages`,
            token,
            {
              stage_index: idx + 1,
              label: stage.label || name,
              stage_type: stage.stageType,
              starts_at: stage.timeBound && stage.startsAt ? `${stage.startsAt}T00:00:00Z` : null,
              ends_at: stage.timeBound && stage.endsAt ? `${stage.endsAt}T23:59:59Z` : null,
              config_json: {
                event_abbreviation: eventAbbr || null,
                stage_abbreviation: stage.abbr || null,
                enforce_exact_team_size: enforceExactTeamSize,
                bracket_type: stage.stageType === 'BRACKET' ? 'SINGLE_ELIM' : null,
                include_round_robin: stage.stageType === 'ROUND_ROBIN',
                bracket_max_teams: payloadMaxTeams,
                bracket_max_rounds: payloadMaxRounds,
                seeding_play_enabled: isTournament ? seedingPlayEnabled : false,
                seeding_format: isTournament ? seedingFormat : '',
                bracket_round_pattern:
                  stage.stageType === 'BRACKET'
                    ? {
                        name_pattern: stage.roundPattern?.namePattern ?? 'Round {i}',
                        abbr_pattern: stage.roundPattern?.abbrPattern ?? 'R{i}',
                        play_days: stage.roundPattern?.playDays ?? 7,
                        gap_days: stage.roundPattern?.gapDays ?? 0,
                        games_per_round: stage.roundPattern?.gamesPerRound ?? '3,3,5,5,7,7',
                      }
                    : undefined,
              },
            },
          );

          const stageSeeds = buildSeedsFromFormula(
            seedFormula,
            eventAbbr,
            stage.abbr,
            getRoundIdForStage(stage, idx),
            stage.gameCount,
            seedHashToken,
          );

          for (let i = 0; i < stageSeeds.length; i += 1) {
            await postJsonAuth(`/events/${encodeURIComponent(targetSlug)}/game-templates`, token, {
              event_stage_id: stagePayload.event_stage_id,
              template_index: i + 1,
              variant,
              seed_payload: stageSeeds[i],
              metadata_json: {},
            });
          }
        }
      }

      setMessage(
        isEdit
          ? `Updated event "${name}".`
          : isSessionLadder
            ? `Created event "${name}".`
            : `Created event "${name}" with ${seedCount} templates.`,
      );

      if (!isEdit) {
        resetForm();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(extractApiErrorMessage(err));
      } else {
        setError(err instanceof Error ? err.message : 'Failed to save event');
      }
    } finally {
      setSaving(false);
    }
  }

  if (isUnauthorized) {
    return <Navigate to="/" replace />;
  }

  return (
    <Box component="main" px="md" py="lg" w="100%" mx="auto">
      <Stack gap="md">
        <Title order={1}>{isEdit ? 'Edit Event' : 'Create Event'}</Title>

        {message && (
          <Alert color="green" variant="light" title="Saved">
            {message}
          </Alert>
        )}

        {error && (
          <Alert color="red" variant="light" title="Error">
            {error}
          </Alert>
        )}

        {isEdit && loadingExisting ? (
          <Text size="sm" c="dimmed">
            Loading event details...
          </Text>
        ) : (
          <SectionCard>
            <Box component="form" onSubmit={handleSubmit}>
              <Stack gap="md">
                <Stepper
                  active={activeStepIndex}
                  onStepClick={(idx) => {
                    const step = visibleSteps[idx];
                    if (step) setCurrentStep(step.key);
                  }}
                  allowNextStepsSelect
                  size="sm"
                >
                  {visibleSteps.map((step) => (
                    <Stepper.Step key={step.key} label={step.label} />
                  ))}
                </Stepper>

                {currentStep === 'type' && (
                  <SectionCard>
                    <Stack gap="sm">
                      <Group justify="space-between">
                        <Title order={4}>Choose Event Type</Title>
                        <Badge variant="light">{`Step ${activeStepIndex + 1} of ${stepOrder.length}`}</Badge>
                      </Group>

                      <Radio.Group
                        label="Event Type"
                        value={eventType}
                        onChange={(value) => {
                          const next = value as 'Challenge' | 'Tournament' | 'League';
                          setEventType(next);
                          if (next === 'Challenge' || next === 'League') {
                            setSeedingPlayEnabled(false);
                            setSeedingFormat('');
                            setMaxTeams('');
                          }
                          if (next === 'League' && !isEdit) {
                            setEventStatus('DORMANT');
                          }
                        }}
                      >
                        <Group mt="xs">
                          <Radio value="Challenge" label="Challenge" />
                          <Radio value="Tournament" label="Tournament" />
                          <Radio value="League" label="League" />
                        </Group>
                      </Radio.Group>
                    </Stack>
                  </SectionCard>
                )}

                {currentStep === 'event' && (
                  <SectionCard>
                    <Stack gap="sm">
                      <Group justify="space-between">
                        <Title order={4}>Event Basics</Title>
                        <Badge variant="light">{`Step ${activeStepIndex + 1} of ${stepOrder.length}`}</Badge>
                      </Group>

                      <TextInput
                        label="Name"
                        value={name}
                        onChange={(e) => setName(e.currentTarget.value)}
                        required
                      />

                      <TextInput
                        label="Slug"
                        value={slug}
                        onChange={(e) => {
                          setSlug(e.currentTarget.value);
                          setSlugEdited(true);
                        }}
                        required
                      />

                      <TextInput
                        label="Short Description"
                        value={shortDescription}
                        onChange={(e) => setShortDescription(e.currentTarget.value)}
                        placeholder="Brief summary"
                      />

                      <TextInput
                        label="Abbreviation"
                        value={eventAbbr}
                        onChange={(e) => setEventAbbr(e.currentTarget.value)}
                        placeholder="e.g. NVC25"
                        error={abbrHasSpace ? 'Abbreviation cannot contain spaces.' : undefined}
                        required
                      />

                      {isTournament && (
                        <Grid>
                          <Grid.Col span={{ base: 12, sm: 4 }}>
                            <Switch
                              label="Include seeding play"
                              checked={seedingPlayEnabled}
                              onChange={(e) => {
                                setSeedingPlayEnabled(e.currentTarget.checked);
                                if (!e.currentTarget.checked) setSeedingFormat('');
                              }}
                            />
                          </Grid.Col>
                          <Grid.Col span={{ base: 12, sm: 4 }}>
                            <Select
                              label="Seeding format"
                              data={[
                                { value: 'round_robin', label: 'Round robin (single pool)' },
                                { value: 'groups', label: 'Group stage (multi-pool)' },
                              ]}
                              value={seedingFormat}
                              onChange={(value) =>
                                setSeedingFormat((value as 'round_robin' | 'groups' | null) ?? '')
                              }
                              disabled={!seedingPlayEnabled}
                              required={seedingPlayEnabled}
                              placeholder="Choose format"
                            />
                          </Grid.Col>
                          <Grid.Col span={{ base: 12, sm: 4 }}>
                            <Select
                              label="Max teams"
                              data={['2', '4', '8', '16', '32', '64']}
                              value={maxTeams}
                              onChange={(value) => setMaxTeams(value ?? '')}
                              required
                              placeholder="Select"
                              rightSection={
                                <Tooltip label="Power of two up to 64. Required for tournaments.">
                                  <Text size="xs" c="dimmed" style={{ cursor: 'help' }}>
                                    info
                                  </Text>
                                </Tooltip>
                              }
                            />
                          </Grid.Col>
                        </Grid>
                      )}

                      {!isSessionLadder && (
                        <Group grow>
                          <TextInput
                            type="date"
                            label="Event starts"
                            value={startsAt}
                            onChange={(e) => setStartsAt(e.currentTarget.value)}
                          />
                          <TextInput
                            type="date"
                            label="Event ends"
                            value={endsAt}
                            onChange={(e) => setEndsAt(e.currentTarget.value)}
                          />
                        </Group>
                      )}

                      <Textarea
                        label="Long Description (Markdown)"
                        minRows={10}
                        maxRows={24}
                        autosize
                        value={longDescription}
                        onChange={(e) => {
                          setLongDescription(e.currentTarget.value);
                          setShowPreview(false);
                        }}
                        required
                      />

                      <Group>
                        <Button type="button" variant="light" onClick={() => setShowPreview(true)}>
                          Preview markdown
                        </Button>
                      </Group>

                      {tournamentLimitError && (
                        <Alert color="red" variant="light">
                          {tournamentLimitError}
                        </Alert>
                      )}
                    </Stack>
                  </SectionCard>
                )}

                {currentStep === 'badges' && hasBadgesStep && (
                  <SectionCard>
                    <Stack gap="sm">
                      <Group justify="space-between">
                        <Title order={4}>
                          {isSessionLadder ? 'League Badges' : 'Challenge Badges'}
                        </Title>
                        <Badge variant="light">{`Step ${activeStepIndex + 1} of ${stepOrder.length}`}</Badge>
                      </Group>

                      <Text size="sm" c="dimmed">
                        {isSessionLadder
                          ? 'Attach badge sets for League season and session awards.'
                          : 'Attach a badge set for Challenge awards.'}
                      </Text>

                      <Group>
                        <Button
                          type="button"
                          variant="light"
                          onClick={() => {
                            saveWizardDraft();
                            const returnTo =
                              isEdit && editSlug
                                ? `/admin/events/${editSlug}/edit`
                                : '/admin/events/create';
                            navigate(
                              `/admin/badges/new?returnTo=${encodeURIComponent(returnTo)}`,
                            );
                          }}
                        >
                          Open Badge Designer
                        </Button>
                      </Group>

                      {isChallenge && (
                        <>
                          <Grid align="end">
                            <Grid.Col span={{ base: 12, sm: 11 }}>
                              <Select
                                label="Challenge Awards Badge Set"
                                placeholder={badgeSetsLoading ? 'Loading badge sets...' : 'None'}
                                data={badgeSelectData}
                                value={challengeBadgeSetId}
                                onChange={(value) => setChallengeBadgeSetId(value)}
                                clearable
                                disabled={badgeSetsLoading}
                              />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, sm: 1 }}>
                              <Tooltip
                                label={
                                  challengeBadgePreview
                                    ? 'Preview selected badge set'
                                    : 'Select a badge set to preview'
                                }
                                withArrow
                              >
                                <Box style={{ display: 'flex', justifyContent: 'center' }}>
                                  <ActionIcon
                                    type="button"
                                    variant="subtle"
                                    size="lg"
                                    onClick={() =>
                                      openBadgePreview(
                                        'Challenge Badge Preview',
                                        challengeBadgePreview,
                                      )
                                    }
                                    disabled={!challengeBadgePreview}
                                    aria-label="Preview challenge badge"
                                  >
                                    <MaterialIcon name="visibility" />
                                  </ActionIcon>
                                </Box>
                              </Tooltip>
                            </Grid.Col>
                          </Grid>

                          <Text size="sm" c="dimmed">
                            Challenge awards are fixed: Gold/Silver/Bronze are based on in-window
                            standings, and Participant is awarded for completion at any time.
                          </Text>
                        </>
                      )}

                      {isSessionLadder && (
                        <>
                          <Grid align="end">
                            <Grid.Col span={{ base: 12, sm: 11 }}>
                              <Select
                                label="Season Awards Badge Set"
                                placeholder={badgeSetsLoading ? 'Loading badge sets...' : 'None'}
                                data={badgeSelectData}
                                value={leagueSeasonBadgeSetId}
                                onChange={(value) => setLeagueSeasonBadgeSetId(value)}
                                clearable
                                disabled={badgeSetsLoading}
                              />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, sm: 1 }}>
                              <Tooltip
                                label={
                                  leagueSeasonBadgePreview
                                    ? 'Preview selected badge set'
                                    : 'Select a badge set to preview'
                                }
                                withArrow
                              >
                                <Box style={{ display: 'flex', justifyContent: 'center' }}>
                                  <ActionIcon
                                    type="button"
                                    variant="subtle"
                                    size="lg"
                                    onClick={() =>
                                      openBadgePreview(
                                        'Season Badge Preview',
                                        leagueSeasonBadgePreview,
                                      )
                                    }
                                    disabled={!leagueSeasonBadgePreview}
                                    aria-label="Preview season badge"
                                  >
                                    <MaterialIcon name="visibility" />
                                  </ActionIcon>
                                </Box>
                              </Tooltip>
                            </Grid.Col>
                          </Grid>

                          <Grid align="end">
                            <Grid.Col span={{ base: 12, sm: 11 }}>
                              <Select
                                label="Session Winner Badge Set"
                                placeholder={badgeSetsLoading ? 'Loading badge sets...' : 'None'}
                                data={badgeSelectData}
                                value={leagueSessionBadgeSetId}
                                onChange={(value) => setLeagueSessionBadgeSetId(value)}
                                clearable
                                disabled={badgeSetsLoading}
                              />
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, sm: 1 }}>
                              <Tooltip
                                label={
                                  leagueSessionBadgePreview
                                    ? 'Preview selected badge set'
                                    : 'Select a badge set to preview'
                                }
                                withArrow
                              >
                                <Box style={{ display: 'flex', justifyContent: 'center' }}>
                                  <ActionIcon
                                    type="button"
                                    variant="subtle"
                                    size="lg"
                                    onClick={() =>
                                      openBadgePreview(
                                        'Session Badge Preview',
                                        leagueSessionBadgePreview,
                                      )
                                    }
                                    disabled={!leagueSessionBadgePreview}
                                    aria-label="Preview session badge"
                                  >
                                    <MaterialIcon name="visibility" />
                                  </ActionIcon>
                                </Box>
                              </Tooltip>
                            </Grid.Col>
                          </Grid>
                        </>
                      )}
                    </Stack>
                  </SectionCard>
                )}

                {currentStep === 'registration' && (
                  <SectionCard>
                    <Stack gap="sm">
                      <Group justify="space-between">
                        <Title order={4}>Registration</Title>
                        <Badge variant="light">{`Step ${activeStepIndex + 1} of ${stepOrder.length}`}</Badge>
                      </Group>

                      {isTournament && (
                        <Alert color="blue" variant="light">
                          Tournaments enforce exact team size, disable late registration, and
                          require registration dates.
                        </Alert>
                      )}

                      <Grid>
                        <Grid.Col span={{ base: 12, sm: 4 }}>
                          <Checkbox
                            label="Allow late registration"
                            checked={allowLateRegistration}
                            onChange={(e) => setAllowLateRegistration(e.currentTarget.checked)}
                            disabled={isTournament}
                          />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, sm: 4 }}>
                          <TextInput
                            type="date"
                            label="Registration opens"
                            value={registrationOpens}
                            onChange={(e) => setRegistrationOpens(e.currentTarget.value)}
                            required={isTournament}
                          />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, sm: 4 }}>
                          <TextInput
                            type="date"
                            label="Registration closes"
                            value={registrationCutoff}
                            onChange={(e) => setRegistrationCutoff(e.currentTarget.value)}
                            required={isTournament}
                          />
                        </Grid.Col>
                      </Grid>

                      <Checkbox
                        label="Enforce exact team size"
                        checked={enforceExactTeamSize}
                        onChange={(e) => setEnforceExactTeamSize(e.currentTarget.checked)}
                        disabled={isTournament}
                      />
                    </Stack>
                  </SectionCard>
                )}

                {currentStep === 'stage' && (
                  <SectionCard>
                    <Stack gap="md">
                      <Group justify="space-between">
                        <Title order={4}>Stage</Title>
                        <Badge variant="light">{`Step ${activeStepIndex + 1} of ${stepOrder.length}`}</Badge>
                      </Group>

                      {stages.map((stage, idx) => (
                        <StageBlock
                          key={idx}
                          stage={stage}
                          index={idx}
                          parsedMaxTeams={parsedMaxTeams}
                          seedingFormat={seedingFormat}
                          onPatch={updateStage}
                        />
                      ))}
                    </Stack>
                  </SectionCard>
                )}

                {currentStep === 'templates' && (
                  <SectionCard>
                    <Stack gap="sm">
                      <Group justify="space-between">
                        <Title order={4}>Templates</Title>
                        <Badge variant="light">{`Step ${activeStepIndex + 1} of ${stepOrder.length}`}</Badge>
                      </Group>

                      {isSessionLadder ? (
                        <Alert color="blue" variant="light">
                          League seeds are managed at the session/round level after event creation.
                        </Alert>
                      ) : (
                        <>
                          <VariantCombobox
                            value={variant}
                            onChange={setVariant}
                            variants={hanabVariants}
                            loading={hanabVariantsLoading}
                          />

                          <NumberInput
                            label="Number of games"
                            min={1}
                            value={seedCount}
                            onChange={(value) => setSeedCount(Number(value) || 1)}
                            required
                          />

                          <TextInput
                            label="Seed formula"
                            value={seedFormula}
                            onChange={(e) => setSeedFormula(e.currentTarget.value)}
                            placeholder="{eID}-{rID}-{i}"
                            required
                            error={
                              formulaHasSpace
                                ? 'Formula cannot contain spaces.'
                                : formulaHasInvalidChars
                                  ? 'Use only letters, numbers, braces, hyphen, underscore, colon, and dot.'
                                  : undefined
                            }
                          />
                          <Button
                            type="button"
                            variant="subtle"
                            size="compact-xs"
                            onClick={() => setShowFormulaHelp(true)}
                          >
                            Formula reference
                          </Button>

                          {invalidTokens.length > 0 && (
                            <Alert color="red" variant="light">
                              Invalid token(s): {invalidTokens.join(', ')}.
                            </Alert>
                          )}

                          {requiredTokensMissing.length > 0 && (
                            <Alert color="red" variant="light">
                              Missing required token(s): {requiredTokensMissing.join(', ')}.
                            </Alert>
                          )}

                          {duplicateSeedsError && (
                            <Alert color="red" variant="light">
                              {duplicateSeedsError}
                            </Alert>
                          )}

                          {seedsHaveInvalidChars && invalidTokens.length === 0 && (
                            <Alert color="yellow" variant="light">
                              Resolved seeds must use letters, numbers, and hyphens only.
                            </Alert>
                          )}

                          <Text size="sm">Preview: {seedPreview.join(', ')}</Text>
                        </>
                      )}
                    </Stack>
                  </SectionCard>
                )}

                <Group justify="space-between" mt="sm">
                  <Checkbox
                    label="Publish event"
                    checked={published}
                    onChange={(e) => setPublished(e.currentTarget.checked)}
                    disabled={saving}
                  />
                  <Group>
                    <Button
                      type="button"
                      variant="default"
                      onClick={onPrev}
                      disabled={currentIndex <= 0 || saving}
                    >
                      Previous
                    </Button>

                    {currentIndex < stepOrder.length - 1 && (
                      <Button
                        type="button"
                        onClick={onNext}
                        disabled={!stepValid(currentStep) || saving}
                      >
                        Next
                      </Button>
                    )}

                    <Button
                      type="submit"
                      disabled={
                        !eventValid ||
                        !badgesValid ||
                        !registrationValid ||
                        !stageValid ||
                        !templatesValid ||
                        saving
                      }
                    >
                      {saving
                        ? isEdit
                          ? 'Saving...'
                          : 'Creating...'
                        : isEdit
                          ? 'Save Event'
                          : 'Create Event'}
                    </Button>
                  </Group>
                </Group>
              </Stack>
            </Box>
          </SectionCard>
        )}
      </Stack>

      <Modal
        opened={showPreview}
        onClose={() => setShowPreview(false)}
        title="Markdown Preview"
        size="lg"
      >
        <MarkdownRenderer markdown={longDescription} />
      </Modal>

      <Modal
        opened={showFormulaHelp}
        onClose={() => setShowFormulaHelp(false)}
        title="Seed Formula"
      >
        <Stack gap="xs">
          <Text size="sm">Use tokens to build template seed values.</Text>
          <Text size="sm">{`{eID}`} = event abbreviation (required)</Text>
          <Text size="sm">{`{rID}`} = round identifier (required for tournaments)</Text>
          <Text size="sm">{`{i}`} = game index (required)</Text>
          <Text size="sm">
            {`{0i}`}, {`{00i}`} = zero-padded game index
          </Text>
          <Text size="sm">{`{hash}`} = random 3-5 digit token</Text>
          <Text size="sm">
            Example: <Code>{`{eID}-{sID}-{00i}`}</Code> {'->'} NVT-RR-001
          </Text>
        </Stack>
      </Modal>

      <Modal
        opened={Boolean(badgePreviewModal)}
        onClose={() => setBadgePreviewModal(null)}
        title={badgePreviewModal?.title ?? 'Badge Preview'}
        centered
        size="md"
      >
        {badgePreviewModal ? (
          <Box
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 260,
            }}
          >
            <Image
              src={`data:image/svg+xml;utf8,${encodeURIComponent(badgePreviewModal.svg)}`}
              alt={badgePreviewModal.title}
              style={{ width: '100%', maxWidth: 360, height: 'auto', display: 'block' }}
            />
          </Box>
        ) : null}
      </Modal>
    </Box>
  );
}
