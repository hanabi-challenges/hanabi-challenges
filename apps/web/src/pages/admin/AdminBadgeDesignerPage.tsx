import {
  CoreAlert as Alert,
  CoreBox as Box,
  CoreButton as Button,
  SectionCard,
  CoreCheckbox as Checkbox,
  CoreGrid as Grid,
  CoreGroup as Group,
  CoreImage as Image,
  CoreModal as Modal,
  CoreSegmentedControl as SegmentedControl,
  CoreSelect as Select,
  CoreStack as Stack,
  CoreText as Text,
  CoreTextInput as TextInput,
  CoreTextarea as Textarea,
  CoreTitle as Title,
} from '../../design-system';
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Link } from '../../mantine';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../lib/api';
import {
  createBadgeSetAuth,
  getBadgeSetByIdAuth,
  listBadgeSetsAuth,
  updateBadgeSetAuth,
  type BadgeSetRecord,
} from './badgeSetsApi';
import { buildBadgePreviewSvg } from './badgeSvgRenderer';
import { normalizeMaterialIconToken, resolveMaterialIconPath } from './materialIconResolver';
import './AdminBadgeDesignerPage.css';

type BadgeShape = 'circle' | 'rounded-square' | 'rounded-hexagon' | 'diamond-facet' | 'rosette';
type TierKey = 'gold' | 'silver' | 'bronze' | 'participant';

type Tier = {
  key: TierKey;
  label: string;
  color: string;
};

type TierSize = 'small' | 'large';
type TierConfig = {
  included: boolean;
  size: TierSize;
};

const SHAPE_OPTIONS: Array<{ value: BadgeShape; label: string }> = [
  { value: 'circle', label: 'Circle' },
  { value: 'rounded-square', label: 'Rounded Square' },
  { value: 'rounded-hexagon', label: 'Rounded Hexagon' },
  { value: 'diamond-facet', label: 'Faceted Diamond' },
  { value: 'rosette', label: 'Rosette / Seal' },
];

const TIERS: Tier[] = [
  { key: 'gold', label: 'Gold', color: '#D4AF37' },
  { key: 'silver', label: 'Silver', color: '#9EA3AD' },
  { key: 'bronze', label: 'Bronze', color: '#B87333' },
  { key: 'participant', label: 'Participant', color: '#B9C4EE' },
];

const DEFAULT_TIER_CONFIG: Record<TierKey, TierConfig> = {
  gold: { included: true, size: 'large' },
  silver: { included: true, size: 'large' },
  bronze: { included: true, size: 'large' },
  participant: { included: true, size: 'small' },
};

export function AdminBadgeDesignerPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { badgeSetId } = useParams<{ badgeSetId: string }>();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  const [shape, setShape] = useState<BadgeShape>('circle');
  const [tier, setTier] = useState<TierKey>('gold');
  const [tierConfig, setTierConfig] = useState<Record<TierKey, TierConfig>>(DEFAULT_TIER_CONFIG);
  const [symbol, setSymbol] = useState<string>('military-tech');
  const [resolvedIconPath, setResolvedIconPath] = useState<string | null>(null);
  const [iconStatus, setIconStatus] = useState<'idle' | 'resolving' | 'resolved' | 'error'>('idle');
  const [iconError, setIconError] = useState<string | null>(null);
  const tierDef = TIERS.find((item) => item.key === tier) ?? TIERS[0];
  const activeTierConfig = tierConfig[tier] ?? DEFAULT_TIER_CONFIG[tier];
  const [mainText, setMainText] = useState<string>('Champion');
  const [secondaryText, setSecondaryText] = useState<string>('S2 CHAMPION');
  const [badgeSetName, setBadgeSetName] = useState<string>('League Season Awards');
  const [activeSetId, setActiveSetId] = useState<number | null>(
    badgeSetId ? Number(badgeSetId) : null,
  );
  const [allSets, setAllSets] = useState<BadgeSetRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveAsOpened, setSaveAsOpened] = useState(false);
  const [saveAsName, setSaveAsName] = useState<string>('League Season Awards');
  const [saveAsNameError, setSaveAsNameError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.token) return;
    let cancelled = false;
    (async () => {
      try {
        const sets = await listBadgeSetsAuth(auth.token as string);
        if (cancelled) return;
        setAllSets(sets);
      } catch {
        if (!cancelled) setAllSets([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.token]);

  useEffect(() => {
    if (!auth.token) return;
    if (!badgeSetId) {
      setActiveSetId(null);
      return;
    }
    const parsedId = Number(badgeSetId);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      setSaveError('Invalid badge set id');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setSaveError(null);
        const existing = await getBadgeSetByIdAuth(auth.token as string, parsedId);
        if (cancelled) return;
        setActiveSetId(existing.id);
        setBadgeSetName(existing.name);
        setShape(existing.shape);
        setSymbol(existing.symbol);
        setResolvedIconPath(existing.icon_path ?? null);
        setMainText(existing.main_text);
        setSecondaryText(existing.secondary_text);
        setTierConfig(existing.tier_config_json);
        setSaveNotice(null);
        setSaveError(null);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) {
          const body = err.body as { error?: string } | null;
          setSaveError(body?.error ?? `Failed to load badge set (${err.status})`);
        } else {
          setSaveError('Failed to load badge set');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.token, badgeSetId]);
  useEffect(() => {
    const raw = symbol.trim();
    if (!raw) {
      setResolvedIconPath(null);
      setIconStatus('error');
      setIconError('Icon token is required.');
      return;
    }
    let cancelled = false;
    setIconStatus('resolving');
    setIconError(null);
    const timer = window.setTimeout(async () => {
      try {
        const resolved = await resolveMaterialIconPath(raw);
        if (cancelled) return;
        setResolvedIconPath(resolved.path);
        setIconStatus('resolved');
        setIconError(null);
      } catch (error) {
        if (cancelled) return;
        setResolvedIconPath(null);
        setIconStatus('error');
        setIconError(error instanceof Error ? error.message : 'Failed to resolve icon.');
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [symbol]);
  const getTierConfig = (key: TierKey): TierConfig => tierConfig[key] ?? DEFAULT_TIER_CONFIG[key];
  const setTierIncluded = (key: TierKey, included: boolean) => {
    setTierConfig((current) => ({
      ...DEFAULT_TIER_CONFIG,
      ...current,
      [key]: { ...(current[key] ?? DEFAULT_TIER_CONFIG[key]), included },
    }));
  };
  const setTierSize = (key: TierKey, size: TierSize) => {
    setTierConfig((current) => ({
      ...DEFAULT_TIER_CONFIG,
      ...current,
      [key]: { ...(current[key] ?? DEFAULT_TIER_CONFIG[key]), size },
    }));
  };
  const isNameTaken = (name: string, ignoreId?: number | null): boolean => {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return false;
    return allSets.some(
      (set) => set.id !== ignoreId && set.name.trim().toLowerCase() === normalized,
    );
  };
  const persist = async (forceNew: boolean, overrideName?: string) => {
    if (!auth.token) {
      setSaveError('Missing auth token.');
      setSaveNotice(null);
      return;
    }
    if (!resolvedIconPath || iconStatus !== 'resolved') {
      setSaveError(iconError ?? 'Icon is not resolved. Please enter a valid Material icon token.');
      setSaveNotice(null);
      return;
    }
    const name = (overrideName ?? badgeSetName).trim() || 'Untitled Badge Set';
    const payload = {
      name,
      shape,
      symbol,
      iconPath: resolvedIconPath ?? undefined,
      mainText,
      secondaryText,
      previewSvg: buildBadgePreviewSvg({
        shape,
        symbol,
        iconPathOverride: resolvedIconPath ?? undefined,
        mainText,
        secondaryText,
        tierConfig,
      }),
      tierConfig,
    };
    try {
      if (!forceNew && activeSetId) {
        if (isNameTaken(name, activeSetId)) {
          setSaveError('A badge set with this name already exists.');
          setSaveNotice(null);
          return;
        }
        await updateBadgeSetAuth(auth.token as string, activeSetId, {
          name: payload.name,
          shape: payload.shape,
          symbol: payload.symbol,
          icon_path: payload.iconPath ?? null,
          main_text: payload.mainText,
          secondary_text: payload.secondaryText,
          preview_svg: payload.previewSvg,
          tier_config_json: payload.tierConfig,
        });
        setAllSets(await listBadgeSetsAuth(auth.token as string));
        setBadgeSetName(name);
        setSaveNotice('Saved.');
        setSaveError(null);
        return;
      }
      if (isNameTaken(name)) {
        setSaveError('A badge set with this name already exists.');
        setSaveNotice(null);
        return;
      }
      const created = await createBadgeSetAuth(auth.token as string, {
        name: payload.name,
        shape: payload.shape,
        symbol: payload.symbol,
        icon_path: payload.iconPath ?? null,
        main_text: payload.mainText,
        secondary_text: payload.secondaryText,
        preview_svg: payload.previewSvg,
        tier_config_json: payload.tierConfig,
      });
      setAllSets(await listBadgeSetsAuth(auth.token as string));
      setActiveSetId(created.id);
      setBadgeSetName(name);
      setSaveNotice(forceNew ? 'Saved as new set.' : 'Saved.');
      setSaveError(null);
      if (returnTo) {
        navigate(returnTo, { replace: true });
      } else {
        navigate(`/admin/badges/${String(created.id)}/edit`, { replace: true });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { error?: string } | null;
        setSaveError(body?.error ?? `Failed to save badge set (${err.status})`);
      } else {
        setSaveError('Failed to save badge set');
      }
      setSaveNotice(null);
    }
  };
  const openSaveAs = () => {
    const defaultName = activeSetId ? `${badgeSetName} Copy` : badgeSetName;
    setSaveAsName(defaultName.trim() || 'Untitled Badge Set');
    setSaveAsNameError(null);
    setSaveAsOpened(true);
  };
  const confirmSaveAs = () => {
    const name = saveAsName.trim();
    if (!name) {
      setSaveAsNameError('Name is required.');
      return;
    }
    if (isNameTaken(name)) {
      setSaveAsNameError('Name must be unique.');
      return;
    }
    setSaveAsOpened(false);
    void persist(true, name);
  };
  const handleSave = () => {
    if (!activeSetId) {
      openSaveAs();
      return;
    }
    void persist(false);
  };
  const livePreviewSvg = useMemo(
    () =>
      buildBadgePreviewSvg({
        shape,
        symbol,
        iconPathOverride: resolvedIconPath ?? undefined,
        mainText,
        secondaryText,
        tierConfig,
        tierOverride: tier,
      }),
    [shape, symbol, resolvedIconPath, mainText, secondaryText, tierConfig, tier],
  );
  const livePreviewDataUri = useMemo(
    () => `data:image/svg+xml;utf8,${encodeURIComponent(livePreviewSvg)}`,
    [livePreviewSvg],
  );

  return (
    <Stack gap="md">
      <Stack gap={2}>
        <Title order={3}>Badge Designer</Title>
        <Text size="sm" c="dimmed">
          SVG renderer with layered ribbon geometry (`z → y → b → x`).
        </Text>
        <Group gap="xs">
          <Button variant="default" onClick={handleSave}>
            Save
          </Button>
          <Button variant="light" onClick={openSaveAs}>
            Save As
          </Button>
          {returnTo ? (
            <Button component={Link} to={returnTo} variant="subtle">
              Back to Event Wizard
            </Button>
          ) : (
            <Button component={Link} to="/admin/badges" variant="subtle">
              Back To Badge Sets
            </Button>
          )}
        </Group>
      </Stack>

      {saveNotice ? (
        <Alert color="green" variant="light">
          {saveNotice}
        </Alert>
      ) : null}
      {loading ? (
        <Alert color="blue" variant="light">
          Loading badge set...
        </Alert>
      ) : null}
      {saveError ? (
        <Alert color="red" variant="light">
          {saveError}
        </Alert>
      ) : null}

      <Grid gutter="md" align="stretch">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <SectionCard style={{ height: '100%' }}>
            <Stack gap="sm">
              <Text fw={600}>Controls</Text>
              <TextInput
                label="Badge Set Name"
                value={badgeSetName}
                onChange={(event) => setBadgeSetName(event.currentTarget.value)}
                placeholder="League Season Awards"
              />
              <Select
                label="Shape"
                value={shape}
                onChange={(value) => setShape((value as BadgeShape) || 'circle')}
                data={SHAPE_OPTIONS}
                allowDeselect={false}
              />
              <TextInput
                label="Icon Token (Material Symbols)"
                value={symbol}
                onChange={(event) => setSymbol(event.currentTarget.value)}
                placeholder="verified"
              />
              <Text size="xs" c={iconStatus === 'error' ? 'red' : 'dimmed'}>
                {iconStatus === 'resolving'
                  ? 'Resolving icon...'
                  : iconStatus === 'resolved'
                    ? `Resolved: material-symbols:${normalizeMaterialIconToken(symbol)}`
                    : (iconError ?? 'Enter any Material icon token.')}
              </Text>
              <Textarea
                label="Main Text (Set)"
                value={mainText}
                onChange={(event) => setMainText(event.currentTarget.value)}
                placeholder="Champion"
                autosize
                minRows={2}
                maxRows={4}
              />
              <TextInput
                label="Secondary Text (Set)"
                value={secondaryText}
                onChange={(event) => setSecondaryText(event.currentTarget.value)}
                placeholder="S2 CHAMPION"
              />
              <Text size="xs" c="dimmed">
                Set-notation supported: `S2 {'{Winner, Medalist, Medalist, Participant}'}`.
              </Text>
              <Stack gap={8}>
                <Text size="sm" fw={600}>
                  Tiers (click to preview)
                </Text>
                {TIERS.map((item) => (
                  <Box
                    key={item.key}
                    component="div"
                    role="button"
                    tabIndex={0}
                    onClick={() => setTier(item.key)}
                    onKeyDown={(event: KeyboardEvent) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setTier(item.key);
                      }
                    }}
                    className={`admin-badge-designer__tier-row${tier === item.key ? ' is-active' : ''}`}
                  >
                    <Group justify="space-between" gap="xs" wrap="nowrap">
                      <Group gap={8} wrap="nowrap">
                        <Box
                          className="admin-badge-designer__tier-swatch"
                          style={{ backgroundColor: item.color }}
                          aria-hidden="true"
                        />
                        <Text size="sm" fw={700}>
                          {item.label}
                        </Text>
                      </Group>
                      <Group gap="xs" wrap="nowrap">
                        <Checkbox
                          size="xs"
                          checked={getTierConfig(item.key).included}
                          onChange={(event) =>
                            setTierIncluded(item.key, event.currentTarget.checked)
                          }
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                          label="Include"
                        />
                        <SegmentedControl
                          size="xs"
                          value={getTierConfig(item.key).size}
                          data={[
                            { label: 'Small', value: 'small' },
                            { label: 'Large', value: 'large' },
                          ]}
                          onChange={(value) => setTierSize(item.key, value as TierSize)}
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </Group>
                    </Group>
                  </Box>
                ))}
              </Stack>
            </Stack>
          </SectionCard>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 8 }}>
          <SectionCard style={{ height: '100%' }}>
            <Stack gap="sm">
              <Text fw={600}>Preview</Text>
              <Text size="xs" c="dimmed">
                Showing {tierDef.label} ({activeTierConfig.size}
                {activeTierConfig.included ? '' : ', excluded'})
              </Text>
              <Group justify="center" py="md">
                <Box className="admin-badge-designer__stage">
                  <Image
                    src={livePreviewDataUri}
                    alt="Badge preview"
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'block',
                      objectFit: 'contain',
                    }}
                  />
                </Box>
              </Group>
            </Stack>
          </SectionCard>
        </Grid.Col>
      </Grid>

      <Modal
        opened={saveAsOpened}
        onClose={() => setSaveAsOpened(false)}
        title="Save Badge Set As"
        centered
      >
        <Stack gap="sm">
          <TextInput
            label="Badge Set Name"
            value={saveAsName}
            onChange={(event) => {
              setSaveAsName(event.currentTarget.value);
              setSaveAsNameError(null);
            }}
            error={saveAsNameError}
            autoFocus
          />
          <Group justify="end">
            <Button variant="default" onClick={() => setSaveAsOpened(false)}>
              Cancel
            </Button>
            <Button onClick={confirmSaveAs}>Save As</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
