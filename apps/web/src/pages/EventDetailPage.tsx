import { useParams, Link, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { DndContext, closestCenter, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { NotFoundPage } from './NotFoundPage';
import { useEventDetail } from '../hooks/useEventDetail';
import { useEventTeams } from '../hooks/useEventTeams';
import { useAuth } from '../context/AuthContext';
import { useUserDirectory } from '../hooks/useUserDirectory';
import { UserPill } from '../features/users/UserPill';
import { getJson, getJsonAuth, putJsonAuth } from '../lib/api';
import { useEventMemberships } from '../hooks/useEventMemberships';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';
import { PageStateNotice } from '../features/shared/PageStateNotice';
import {
  LeagueGameBlocks,
  LeagueResultsTables,
  RegisterModal,
  SortableQueuedRoundPill,
  StaticRoundPill,
  firstHeadingSectionMarkdown,
  formatDateRange,
} from '../features/events/event-detail/fragments';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Heading,
  Inline,
  Input,
  InputContainer,
  Modal,
  PageContainer,
  Pill,
  SearchSelect,
  Section,
  Stack,
  Text,
  ToggleSwitch,
  Alert,
  Tooltip,
  Tabs,
  Main,
  CoreDivider as Divider,
  CoreTable as Table,
  CoreUnstyledButton as UnstyledButton,
} from '../design-system';

const spinnerKeyframes = `
@keyframes ds-rotate {
  to { transform: rotate(360deg); }
}
`;

type VariantCatalogItem = {
  code: number;
  name: string;
  label: string;
};

type LiveSessionStatePayload = {
  rounds: Array<{
    id: number;
    round_index: number;
    seed_payload: string | null;
    status: 'pending' | 'assigning' | 'playing' | 'scoring' | 'finalized';
  }>;
  presence: Array<{
    user_id: number;
    display_name: string;
    role: 'playing' | 'spectating';
    state: 'online' | 'offline';
    last_seen_at: string | null;
  }>;
  round_players: Array<{
    round_id: number;
    user_id: number;
    display_name: string;
    role: 'playing' | 'spectating';
    assigned_team_no: number | null;
  }>;
  round_results: Array<{
    round_id: number;
    team_no: number;
    score: number;
    submitted_at: string;
    submitted_by_user_id: number | null;
    replay_game_id: string | null;
  }>;
  ready_check: {
    id: number;
    status: 'open' | 'closed';
    started_at: string;
    ends_at: string;
    initiated_by_user_id: number | null;
    closed_at: string | null;
  } | null;
  ready_responses: Array<{
    user_id: number;
    is_ready: boolean;
    responded_at: string;
  }>;
};

export function EventDetailPage() {
  const { slug, teamSize } = useParams<{ slug: string; teamSize?: string }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const { users: directory } = useUserDirectory();
  const { memberships } = useEventMemberships(slug);
  const [showRegister, setShowRegister] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [liveRefreshTick, setLiveRefreshTick] = useState(0);
  const [eventStatus, setEventStatus] = useState<'DORMANT' | 'LIVE' | 'COMPLETE'>('DORMANT');
  const [adminRailCollapsed, setAdminRailCollapsed] = useState(false);
  const [adminRailDefaultApplied, setAdminRailDefaultApplied] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [sessionAccess, setSessionAccess] = useState<{
    can_manage: boolean;
    owner_user_id: number | null;
    delegates: Array<{ user_id: number; display_name: string }>;
  } | null>(null);
  const [sessionList, setSessionList] = useState<
    Array<{
      id: number;
      session_index: number;
      status: 'scheduled' | 'live' | 'closed';
      starts_at: string | null;
      ends_at: string | null;
      round_count: number;
    }>
  >([]);
  const [createSessionSaving, setCreateSessionSaving] = useState(false);
  const [variantCatalog, setVariantCatalog] = useState<VariantCatalogItem[]>([]);
  const [variantQuery, setVariantQuery] = useState('');
  const [selectedVariantCode, setSelectedVariantCode] = useState<number | null>(null);
  const [queueSeedInput, setQueueSeedInput] = useState('');
  const [queueGameSaving, setQueueGameSaving] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [stagedSessionRounds, setStagedSessionRounds] = useState<
    Array<{
      id: number;
      round_index: number;
      seed_payload: string | null;
      status: 'pending' | 'assigning' | 'playing' | 'scoring' | 'finalized';
    }>
  >([]);
  const [sessionToggleConfirmOpen, setSessionToggleConfirmOpen] = useState(false);
  const [endLeagueConfirmOpen, setEndLeagueConfirmOpen] = useState(false);
  const [createGameModalOpen, setCreateGameModalOpen] = useState(false);
  const [startGameConfirmOpen, setStartGameConfirmOpen] = useState(false);
  const [draggingRoundId, setDraggingRoundId] = useState<number | null>(null);
  const [startGameSaving, setStartGameSaving] = useState(false);
  const [leagueTab, setLeagueTab] = useState<'overview' | 'results'>('overview');
  const [showFullOverview, setShowFullOverview] = useState(false);
  const [presenceSaving, setPresenceSaving] = useState(false);
  const [presenceRemovingUserId, setPresenceRemovingUserId] = useState<number | null>(null);
  const [readySubmitting, setReadySubmitting] = useState(false);
  const [readyFinalizeInFlight, setReadyFinalizeInFlight] = useState(false);
  const [readyFinalizeForId, setReadyFinalizeForId] = useState<number | null>(null);
  const [presenceError, setPresenceError] = useState<string | null>(null);
  const [liveSessionState, setLiveSessionState] = useState<LiveSessionStatePayload | null>(null);
  const [resultsTab, setResultsTab] = useState<string>('standings');
  const [resultsSummary, setResultsSummary] = useState<{
    sessions: Array<{
      id: number;
      session_index: number;
      status: 'scheduled' | 'live' | 'closed';
      starts_at: string | null;
      ends_at: string | null;
      round_count: number;
    }>;
    standings: Array<{
      user_id: number;
      display_name: string;
      rating: number;
      games_played: number;
      sessions_played: number;
      last_played_at: string | null;
    }>;
    placements: Array<{
      session_id: number;
      session_index: number;
      round_id: number;
      round_index: number;
      user_id: number;
      display_name: string;
      placement: number;
    }>;
    session_elo: Array<{
      session_id: number;
      session_index: number;
      user_id: number;
      display_name: string;
      starting_elo: number;
      final_elo: number;
      elo_delta: number;
    }>;
  } | null>(null);
  const [ratingHistory, setRatingHistory] = useState<
    Array<{
      ledger_id: number;
      event_id: number;
      session_id: number;
      session_index: number;
      round_id: number;
      round_index: number;
      user_id: number;
      display_name: string;
      old_rating: number;
      delta_competitive: number;
      delta_participation: number;
      new_rating: number;
      created_at: string;
    }>
  >([]);
  const [gamesTab, setGamesTab] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  function formatCountdown(ms: number) {
    if (Number.isNaN(ms)) return '';
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  const parsedTeamSize = (() => {
    const n = teamSize ? Number(teamSize) : 3;
    if (!Number.isInteger(n) || n < 2 || n > 6) return 3;
    return n;
  })();

  const { event, loading, error, notFound } = useEventDetail(slug);
  const {
    teams,
    loading: teamsLoading,
    error: teamsError,
    refetch: refetchTeams,
  } = useEventTeams(slug);
  const directoryById = useMemo(() => {
    const map = new Map<number, { color_hex: string; text_color: string }>();
    directory.forEach((user) => {
      map.set(user.id, { color_hex: user.color_hex, text_color: user.text_color });
    });
    return map;
  }, [directory]);

  useEffect(() => {
    if (!event?.event_status) return;
    setEventStatus(event.event_status);
  }, [event?.event_status]);

  const isSessionLadder = event?.event_format === 'session_ladder';
  const isChallenge = event?.event_format === 'challenge';

  useEffect(() => {
    if (!isSessionLadder) return;
    const id = window.setInterval(() => {
      setLiveRefreshTick((tick) => tick + 1);
    }, 3000);
    return () => window.clearInterval(id);
  }, [isSessionLadder]);

  useEffect(() => {
    async function loadSessionData() {
      if (!isSessionLadder || !slug) return;
      try {
        const [summaryResp, historyResp] = await Promise.all([
          getJson<{
            sessions: typeof sessionList;
            standings: Array<{
              user_id: number;
              display_name: string;
              rating: number;
              games_played: number;
              sessions_played: number;
              last_played_at: string | null;
            }>;
            placements: Array<{
              session_id: number;
              session_index: number;
              round_id: number;
              round_index: number;
              user_id: number;
              display_name: string;
              placement: number;
            }>;
            session_elo: Array<{
              session_id: number;
              session_index: number;
              user_id: number;
              display_name: string;
              starting_elo: number;
              final_elo: number;
              elo_delta: number;
            }>;
          }>(`/session-ladder/events/${encodeURIComponent(slug)}/results-summary`),
          getJson<{
            history: Array<{
              ledger_id: number;
              event_id: number;
              session_id: number;
              session_index: number;
              round_id: number;
              round_index: number;
              user_id: number;
              display_name: string;
              old_rating: number;
              delta_competitive: number;
              delta_participation: number;
              new_rating: number;
              created_at: string;
            }>;
          }>(`/session-ladder/events/${encodeURIComponent(slug)}/history?limit=5000`),
        ]);
        setSessionList(summaryResp.sessions ?? []);
        setResultsSummary(summaryResp);
        setRatingHistory(historyResp.history ?? []);
      } catch {
        // Keep page usable if session API fails
        setResultsSummary(null);
        setRatingHistory([]);
      }

      if (!auth.token) return;
      try {
        const accessResp = await getJsonAuth<{
          can_manage: boolean;
          owner_user_id: number | null;
          delegates: Array<{ user_id: number; display_name: string }>;
        }>(`/session-ladder/events/${encodeURIComponent(slug)}/access`, auth.token);
        setSessionAccess(accessResp);
      } catch {
        setSessionAccess(null);
      }
    }
    void loadSessionData();
  }, [isSessionLadder, slug, auth.token, liveRefreshTick]);

  useEffect(() => {
    async function loadVariants() {
      try {
        const resp = await getJson<{ variants: VariantCatalogItem[] }>('/variants');
        setVariantCatalog(resp.variants ?? []);
      } catch {
        setVariantCatalog([]);
      }
    }
    void loadVariants();
  }, []);

  const liveSession = useMemo(
    () => sessionList.find((session) => session.status === 'live') ?? null,
    [sessionList],
  );
  const stagedSession = useMemo(() => {
    const openSessions = sessionList.filter((session) => session.status !== 'closed');
    if (!openSessions.length) return null;
    return [...openSessions].sort((a, b) => b.session_index - a.session_index)[0];
  }, [sessionList]);

  useEffect(() => {
    async function loadLiveSessionState() {
      if (!isSessionLadder || !liveSession?.id || !auth.token) {
        setLiveSessionState(null);
        return;
      }
      try {
        const state = await getJsonAuth<LiveSessionStatePayload>(
          `/session-ladder/sessions/${liveSession.id}/state`,
          auth.token,
        );
        setLiveSessionState({
          rounds: state.rounds ?? [],
          presence: state.presence ?? [],
          round_players: state.round_players ?? [],
          round_results: state.round_results ?? [],
          ready_check: state.ready_check ?? null,
          ready_responses: state.ready_responses ?? [],
        });
      } catch {
        setLiveSessionState(null);
      }
    }
    void loadLiveSessionState();
  }, [isSessionLadder, liveSession?.id, auth.token, liveRefreshTick]);

  useEffect(() => {
    async function loadStagedSessionRounds() {
      const canManage = Boolean(sessionAccess?.can_manage || auth.user?.role === 'SUPERADMIN');
      if (!isSessionLadder || !stagedSession?.id || !auth.token || !canManage) {
        setStagedSessionRounds([]);
        return;
      }
      try {
        const state = await getJsonAuth<{
          rounds: Array<{
            id: number;
            round_index: number;
            seed_payload: string | null;
            status: 'pending' | 'assigning' | 'playing' | 'scoring' | 'finalized';
          }>;
        }>(`/session-ladder/sessions/${stagedSession.id}/state`, auth.token);
        setStagedSessionRounds(state.rounds ?? []);
      } catch {
        setStagedSessionRounds([]);
      }
    }
    void loadStagedSessionRounds();
  }, [
    isSessionLadder,
    stagedSession?.id,
    auth.token,
    sessionAccess?.can_manage,
    auth.user?.role,
    liveRefreshTick,
  ]);

  useEffect(() => {
    setAdminRailDefaultApplied(false);
  }, [slug, auth.user?.id]);

  useEffect(() => {
    const canManage = Boolean(sessionAccess?.can_manage || auth.user?.role === 'SUPERADMIN');
    const isOwner = Boolean(
      sessionAccess?.owner_user_id != null && auth.user?.id === sessionAccess.owner_user_id,
    );
    if (!isSessionLadder || !canManage || adminRailDefaultApplied) return;
    // Default open for owner; closed for delegates and superadmins.
    setAdminRailCollapsed(!isOwner);
    setAdminRailDefaultApplied(true);
  }, [
    isSessionLadder,
    sessionAccess?.can_manage,
    sessionAccess?.owner_user_id,
    auth.user?.id,
    auth.user?.role,
    adminRailDefaultApplied,
  ]);

  useEffect(() => {
    async function maybeFinalizeReadyCheck() {
      const canManage = Boolean(sessionAccess?.can_manage || auth.user?.role === 'SUPERADMIN');
      const readyCheck = liveSessionState?.ready_check;
      const openReadyCheck = readyCheck?.status === 'open' ? readyCheck : null;
      if (
        !isSessionLadder ||
        !canManage ||
        !auth.token ||
        !stagedSession?.id ||
        !openReadyCheck ||
        openReadyCheck.id === readyFinalizeForId ||
        readyFinalizeInFlight
      ) {
        return;
      }
      if (new Date(openReadyCheck.ends_at).getTime() > Date.now()) return;

      setReadyFinalizeInFlight(true);
      setReadyFinalizeForId(openReadyCheck.id);
      try {
        await postJsonAuth(
          `/session-ladder/sessions/${stagedSession.id}/ready-check/finalize`,
          auth.token,
          {},
        );
        const [sessionState, liveState] = await Promise.all([
          getJsonAuth<{
            rounds: Array<{
              id: number;
              round_index: number;
              seed_payload: string | null;
              status: 'pending' | 'assigning' | 'playing' | 'scoring' | 'finalized';
            }>;
          }>(`/session-ladder/sessions/${stagedSession.id}/state`, auth.token),
          liveSession?.id
            ? getJsonAuth<LiveSessionStatePayload>(
                `/session-ladder/sessions/${liveSession.id}/state`,
                auth.token,
              )
            : Promise.resolve(null),
        ]);
        setStagedSessionRounds(sessionState.rounds ?? []);
        if (liveState) {
          setLiveSessionState({
            rounds: liveState.rounds ?? [],
            presence: liveState.presence ?? [],
            round_players: liveState.round_players ?? [],
            round_results: liveState.round_results ?? [],
            ready_check: liveState.ready_check ?? null,
            ready_responses: liveState.ready_responses ?? [],
          });
        }
      } catch {
        // keep polling path
      } finally {
        setReadyFinalizeInFlight(false);
      }
    }
    void maybeFinalizeReadyCheck();
  }, [
    isSessionLadder,
    sessionAccess?.can_manage,
    auth.user?.role,
    auth.token,
    stagedSession?.id,
    liveSessionState?.ready_check,
    liveSessionState?.ready_check?.id,
    liveSessionState?.ready_check?.status,
    liveSessionState?.ready_check?.ends_at,
    readyFinalizeForId,
    readyFinalizeInFlight,
    liveSession?.id,
  ]);

  const canManageLeague = Boolean(sessionAccess?.can_manage || auth.user?.role === 'SUPERADMIN');
  const isLeagueLive = isSessionLadder && eventStatus === 'LIVE';
  const currentPresence =
    liveSessionState?.presence.find((p) => p.user_id === auth.user?.id) ?? null;
  const isJoinedLiveSession = currentPresence?.state === 'online';
  const openReadyCheck =
    liveSessionState?.ready_check?.status === 'open' ? liveSessionState.ready_check : null;
  const myReadyResponse = openReadyCheck
    ? (liveSessionState?.ready_responses ?? []).find((r) => r.user_id === auth.user?.id)
    : null;
  const liveCurrentRound =
    (liveSessionState?.rounds ?? []).find(
      (r) => r.status === 'playing' || r.status === 'scoring',
    ) ??
    (liveSessionState?.rounds ?? []).find((r) => r.status === 'assigning') ??
    null;
  const myLiveTeamNo =
    liveCurrentRound && auth.user
      ? ((liveSessionState?.round_players ?? []).find(
          (p) =>
            p.round_id === liveCurrentRound.id &&
            p.user_id === auth.user.id &&
            p.role === 'playing' &&
            p.assigned_team_no != null,
        )?.assigned_team_no ?? null)
      : null;
  const myLiveTeamSubmitted =
    liveCurrentRound && myLiveTeamNo != null
      ? (liveSessionState?.round_results ?? []).some(
          (r) => r.round_id === liveCurrentRound.id && r.team_no === Number(myLiveTeamNo),
        )
      : false;
  const shouldShowAwakePrompt = Boolean(
    openReadyCheck &&
    auth.user &&
    currentPresence?.state === 'online' &&
    !myReadyResponse?.is_ready,
  );
  const myTeamPageHref =
    isSessionLadder &&
    slug &&
    liveSession?.id &&
    isLeagueLive &&
    liveCurrentRound &&
    myLiveTeamNo != null &&
    !myLiveTeamSubmitted
      ? `/events/${slug}/sessions/${liveSession.id}/team/${liveCurrentRound.id}/${Number(myLiveTeamNo)}`
      : null;
  const liveRoundsSorted = useMemo(
    () => [...(liveSessionState?.rounds ?? [])].sort((a, b) => a.round_index - b.round_index),
    [liveSessionState?.rounds],
  );
  const liveOngoingRound =
    liveRoundsSorted.find(
      (r) => r.status === 'assigning' || r.status === 'playing' || r.status === 'scoring',
    ) ?? null;
  const liveLastCompletedRound =
    [...liveRoundsSorted].reverse().find((r) => r.status === 'finalized') ?? null;
  const liveMostRecentRound = [...liveRoundsSorted].reverse()[0] ?? null;
  const recommendedGamesTab = (() => {
    if (!liveMostRecentRound) return null;
    if (!liveOngoingRound || !auth.user) return `round-${liveMostRecentRound.id}`;
    const myRoundPlayer = (liveSessionState?.round_players ?? []).find(
      (p) =>
        p.round_id === liveOngoingRound.id &&
        p.user_id === auth.user.id &&
        p.role === 'playing' &&
        p.assigned_team_no != null,
    );
    if (!myRoundPlayer?.assigned_team_no) return `round-${liveOngoingRound.id}`;
    const submitted = (liveSessionState?.round_results ?? []).some(
      (r) =>
        r.round_id === liveOngoingRound.id && r.team_no === Number(myRoundPlayer.assigned_team_no),
    );
    if (submitted) return `round-${liveOngoingRound.id}`;
    if (liveLastCompletedRound) return `round-${liveLastCompletedRound.id}`;
    return `round-${liveOngoingRound.id}`;
  })();
  const blockedOngoingRoundIdForViewer = (() => {
    if (!liveOngoingRound || !auth.user) return null;
    const myRoundPlayer = (liveSessionState?.round_players ?? []).find(
      (p) =>
        p.round_id === liveOngoingRound.id &&
        p.user_id === auth.user.id &&
        p.role === 'playing' &&
        p.assigned_team_no != null,
    );
    if (!myRoundPlayer?.assigned_team_no) return null;
    const submitted = (liveSessionState?.round_results ?? []).some(
      (r) =>
        r.round_id === liveOngoingRound.id && r.team_no === Number(myRoundPlayer.assigned_team_no),
    );
    return submitted ? null : liveOngoingRound.id;
  })();
  const visibleGameRounds = liveRoundsSorted.filter(
    (round) => round.id !== blockedOngoingRoundIdForViewer,
  );

  useEffect(() => {
    if (!recommendedGamesTab) return;
    const exists = visibleGameRounds.some((r) => `round-${r.id}` === gamesTab);
    if (!gamesTab || !exists) {
      setGamesTab(recommendedGamesTab);
    }
  }, [recommendedGamesTab, gamesTab, visibleGameRounds]);
  const assignmentRedirectKey =
    isSessionLadder &&
    slug &&
    liveSession?.id &&
    liveCurrentRound?.id &&
    myLiveTeamNo != null &&
    auth.user?.id
      ? `${slug}:${liveSession.id}:${liveCurrentRound.id}:${Number(myLiveTeamNo)}:${auth.user.id}`
      : null;

  useEffect(() => {
    if (!myTeamPageHref || !assignmentRedirectKey) return;
    const storageKey = 'session-ladder:last-assignment-redirect';
    const lastRedirected = window.sessionStorage.getItem(storageKey);
    if (lastRedirected === assignmentRedirectKey) return;
    window.sessionStorage.setItem(storageKey, assignmentRedirectKey);
    navigate(myTeamPageHref, { replace: true });
  }, [myTeamPageHref, assignmentRedirectKey, navigate]);

  if (notFound) {
    return <NotFoundPage />;
  }

  if (loading) {
    return <PageStateNotice message="Loading event..." />;
  }

  if (error && !event) {
    return <PageStateNotice title="Event" message={error} variant="error" />;
  }

  if (!event) {
    return <PageStateNotice title="Event not found" message="This event does not exist." />;
  }

  const startsAt = event.starts_at ? new Date(event.starts_at) : null;
  const endsAt = event.ends_at ? new Date(event.ends_at) : null;
  const cutoff = event.registration_cutoff ? new Date(event.registration_cutoff) : endsAt;
  const registrationOpens = event.registration_opens_at
    ? new Date(event.registration_opens_at)
    : startsAt;
  const now = new Date();
  const registrationClosed = !!(cutoff && now > cutoff && !event.allow_late_registration);
  const registrationWindow = (() => {
    if (registrationOpens && nowTs < registrationOpens.getTime()) {
      return {
        label: `Opens in ${formatCountdown(registrationOpens.getTime() - nowTs)}`,
        variant: 'default' as const,
        canRegister: false,
      };
    }
    if (cutoff && nowTs < cutoff.getTime()) {
      return {
        label: `Closes in ${formatCountdown(cutoff.getTime() - nowTs)}`,
        variant: 'accent' as const,
        canRegister: true,
      };
    }
    if (registrationClosed) {
      return { label: 'Registration closed', variant: 'default' as const, canRegister: false };
    }
    return { label: 'Registration open', variant: 'accent' as const, canRegister: true };
  })();

  const createSession = async () => {
    if (!auth.token || !slug) return;
    setCreateSessionSaving(true);
    setSessionError(null);
    try {
      await postJsonAuth(
        `/session-ladder/events/${encodeURIComponent(slug)}/sessions`,
        auth.token,
        {
          starts_at: null,
        },
      );
      const summaryResp = await getJson<{
        sessions: typeof sessionList;
        standings: NonNullable<typeof resultsSummary>['standings'];
        placements: NonNullable<typeof resultsSummary>['placements'];
        session_elo: NonNullable<typeof resultsSummary>['session_elo'];
      }>(`/session-ladder/events/${encodeURIComponent(slug)}/results-summary`);
      setSessionList(summaryResp.sessions ?? []);
      setResultsSummary(summaryResp);
    } catch (err) {
      if (err instanceof ApiError) {
        setSessionError((err.body as { error?: string })?.error ?? 'Failed to create session.');
      } else {
        setSessionError('Failed to create session.');
      }
    } finally {
      setCreateSessionSaving(false);
    }
  };

  const refreshLeagueSummaryAndHistory = async () => {
    if (!slug) return;
    const [summaryResp, historyResp] = await Promise.all([
      getJson<{
        sessions: typeof sessionList;
        standings: NonNullable<typeof resultsSummary>['standings'];
        placements: NonNullable<typeof resultsSummary>['placements'];
        session_elo: NonNullable<typeof resultsSummary>['session_elo'];
      }>(`/session-ladder/events/${encodeURIComponent(slug)}/results-summary`),
      getJson<{
        history: Array<{
          ledger_id: number;
          event_id: number;
          session_id: number;
          session_index: number;
          round_id: number;
          round_index: number;
          user_id: number;
          display_name: string;
          old_rating: number;
          delta_competitive: number;
          delta_participation: number;
          new_rating: number;
          created_at: string;
        }>;
      }>(`/session-ladder/events/${encodeURIComponent(slug)}/history?limit=5000`),
    ]);
    setSessionList(summaryResp.sessions ?? []);
    setResultsSummary(summaryResp);
    setRatingHistory(historyResp.history ?? []);
  };

  const queueGame = async () => {
    if (!auth.token || !slug) return;
    if (!stagedSession?.id) {
      setSessionError('Create a session first.');
      return;
    }
    const selectedVariant = variantCatalog.find((variant) => variant.code === selectedVariantCode);
    if (!selectedVariant || !queueSeedInput.trim()) {
      setSessionError('Variant and seed are required.');
      return;
    }
    setQueueGameSaving(true);
    setSessionError(null);
    try {
      await postJsonAuth(`/session-ladder/sessions/${stagedSession.id}/rounds`, auth.token, {
        variant: selectedVariant.label,
        seed: queueSeedInput.trim(),
      });
      const summaryResp = await getJson<{
        sessions: typeof sessionList;
        standings: NonNullable<typeof resultsSummary>['standings'];
        placements: NonNullable<typeof resultsSummary>['placements'];
        session_elo: NonNullable<typeof resultsSummary>['session_elo'];
      }>(`/session-ladder/events/${encodeURIComponent(slug)}/results-summary`);
      setSessionList(summaryResp.sessions ?? []);
      setResultsSummary(summaryResp);
      const state = await getJsonAuth<{
        rounds: Array<{
          id: number;
          round_index: number;
          seed_payload: string | null;
          status: 'pending' | 'assigning' | 'playing' | 'scoring' | 'finalized';
        }>;
      }>(`/session-ladder/sessions/${stagedSession.id}/state`, auth.token);
      setStagedSessionRounds(state.rounds ?? []);
      setQueueSeedInput('');
      setSelectedVariantCode(null);
      setVariantQuery('');
      setCreateGameModalOpen(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setSessionError((err.body as { error?: string })?.error ?? 'Failed to queue game.');
      } else {
        setSessionError('Failed to queue game.');
      }
    } finally {
      setQueueGameSaving(false);
    }
  };
  const isOpenEvent = isSessionLadder ? isLeagueLive : registrationWindow.canRegister;

  const setMyPresence = async (nextState: 'online' | 'offline') => {
    if (!auth.token || !liveSession?.id) return;
    setPresenceSaving(true);
    setPresenceError(null);
    try {
      await postJsonAuth(`/session-ladder/sessions/${liveSession.id}/presence`, auth.token, {
        role: nextState === 'online' ? 'playing' : (currentPresence?.role ?? 'playing'),
        state: nextState,
      });
      const refreshed = await getJsonAuth<LiveSessionStatePayload>(
        `/session-ladder/sessions/${liveSession.id}/state`,
        auth.token,
      );
      setLiveSessionState({
        rounds: refreshed.rounds ?? [],
        presence: refreshed.presence ?? [],
        round_players: refreshed.round_players ?? [],
        round_results: refreshed.round_results ?? [],
        ready_check: refreshed.ready_check ?? null,
        ready_responses: refreshed.ready_responses ?? [],
      });
    } catch {
      setPresenceError('Unable to update participation right now.');
    } finally {
      setPresenceSaving(false);
    }
  };
  const removeParticipant = async (userId: number) => {
    if (!auth.token || !liveSession?.id || !canManageLeague) return;
    setPresenceRemovingUserId(userId);
    setPresenceError(null);
    try {
      await postJsonAuth(
        `/session-ladder/sessions/${liveSession.id}/presence/${userId}/remove`,
        auth.token,
        {},
      );
      const refreshed = await getJsonAuth<LiveSessionStatePayload>(
        `/session-ladder/sessions/${liveSession.id}/state`,
        auth.token,
      );
      setLiveSessionState({
        rounds: refreshed.rounds ?? [],
        presence: refreshed.presence ?? [],
        round_players: refreshed.round_players ?? [],
        round_results: refreshed.round_results ?? [],
        ready_check: refreshed.ready_check ?? null,
        ready_responses: refreshed.ready_responses ?? [],
      });
    } catch {
      setPresenceError('Unable to remove participant right now.');
    } finally {
      setPresenceRemovingUserId(null);
    }
  };
  const reorderRounds = async (sourceId: number, targetId: number) => {
    if (!stagedSession?.id || !auth.token || sourceId === targetId) return;
    setDraggingRoundId(null);
    const pending = stagedSessionRounds
      .filter((r) => r.status === 'pending')
      .sort((a, b) => a.round_index - b.round_index);
    const sourceIdx = pending.findIndex((r) => r.id === sourceId);
    const targetIdx = pending.findIndex((r) => r.id === targetId);
    if (sourceIdx < 0 || targetIdx < 0) return;

    const reordered = [...pending];
    const [moved] = reordered.splice(sourceIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    setSessionError(null);

    try {
      await postJsonAuth(
        `/session-ladder/sessions/${stagedSession.id}/rounds/reorder`,
        auth.token,
        {
          round_ids: reordered.map((r) => r.id),
        },
      );
      const state = await getJsonAuth<{
        rounds: Array<{
          id: number;
          round_index: number;
          seed_payload: string | null;
          status: 'pending' | 'assigning' | 'playing' | 'scoring' | 'finalized';
        }>;
      }>(`/session-ladder/sessions/${stagedSession.id}/state`, auth.token);
      setStagedSessionRounds(state.rounds ?? []);
    } catch (err) {
      if (err instanceof ApiError) {
        setSessionError((err.body as { error?: string })?.error ?? 'Failed to reorder games.');
      } else {
        setSessionError('Failed to reorder games.');
      }
      const state = await getJsonAuth<{
        rounds: Array<{
          id: number;
          round_index: number;
          seed_payload: string | null;
          status: 'pending' | 'assigning' | 'playing' | 'scoring' | 'finalized';
        }>;
      }>(`/session-ladder/sessions/${stagedSession.id}/state`, auth.token);
      setStagedSessionRounds(state.rounds ?? []);
    } finally {
      setDraggingRoundId(null);
    }
  };
  const handleQueuedDragStart = (event: DragStartEvent) => {
    const idNum = Number(event.active.id);
    setDraggingRoundId(Number.isInteger(idNum) ? idNum : null);
  };

  const handleQueuedDragEnd = (event: DragEndEvent) => {
    const activeId = Number(event.active.id);
    const overId = event.over ? Number(event.over.id) : null;
    setDraggingRoundId(null);
    if (!Number.isInteger(activeId) || !Number.isInteger(overId) || activeId === overId) return;
    void reorderRounds(activeId, overId);
  };
  const isSessionLive = stagedSession?.status === 'live';

  const setSessionLive = async (nextLive: boolean) => {
    if (!auth.token || !slug) return;
    setStatusSaving(true);
    setStatusError(null);
    try {
      if (nextLive) {
        let targetSessionId = stagedSession?.id ?? null;
        if (!targetSessionId) {
          const created = await postJsonAuth<{ id: number }>(
            `/session-ladder/events/${encodeURIComponent(slug)}/sessions`,
            auth.token,
            { starts_at: null },
          );
          targetSessionId = created.id;
        }

        await postJsonAuth(`/session-ladder/sessions/${targetSessionId}/start`, auth.token, {});
        await putJsonAuth(`/events/${encodeURIComponent(event.slug)}`, auth.token, {
          event_status: 'LIVE',
        });
        setEventStatus('LIVE');
      } else {
        if (!stagedSession?.id) return;
        await postJsonAuth(`/session-ladder/sessions/${stagedSession.id}/close`, auth.token, {});
        await putJsonAuth(`/events/${encodeURIComponent(event.slug)}`, auth.token, {
          event_status: 'DORMANT',
        });
        setEventStatus('DORMANT');
      }

      const summaryResp = await getJson<{
        sessions: typeof sessionList;
        standings: NonNullable<typeof resultsSummary>['standings'];
        placements: NonNullable<typeof resultsSummary>['placements'];
        session_elo: NonNullable<typeof resultsSummary>['session_elo'];
      }>(`/session-ladder/events/${encodeURIComponent(slug)}/results-summary`);
      setSessionList(summaryResp.sessions ?? []);
      setResultsSummary(summaryResp);
    } catch (err) {
      if (err instanceof ApiError) {
        setStatusError(
          (err.body as { error?: string })?.error ?? 'Failed to update session state.',
        );
      } else {
        setStatusError('Failed to update session state.');
      }
    } finally {
      setStatusSaving(false);
    }
  };

  const endLeague = async () => {
    if (!auth.token || !slug || !isSessionLadder) return;
    setStatusSaving(true);
    setStatusError(null);
    try {
      await postJsonAuth(`/session-ladder/events/${encodeURIComponent(slug)}/end`, auth.token, {});
      setEventStatus('COMPLETE');
      const summaryResp = await getJson<{
        sessions: typeof sessionList;
        standings: NonNullable<typeof resultsSummary>['standings'];
        placements: NonNullable<typeof resultsSummary>['placements'];
        session_elo: NonNullable<typeof resultsSummary>['session_elo'];
      }>(`/session-ladder/events/${encodeURIComponent(slug)}/results-summary`);
      setSessionList(summaryResp.sessions ?? []);
      setResultsSummary(summaryResp);
    } catch (err) {
      if (err instanceof ApiError) {
        setStatusError((err.body as { error?: string })?.error ?? 'Failed to end league.');
      } else {
        setStatusError('Failed to end league.');
      }
    } finally {
      setStatusSaving(false);
    }
  };
  const pendingRounds = stagedSessionRounds
    .filter((round) => round.status === 'pending')
    .sort((a, b) => a.round_index - b.round_index);
  const orderedRounds = [...stagedSessionRounds].sort((a, b) => a.round_index - b.round_index);
  const activeRound = orderedRounds.find(
    (round) =>
      round.status === 'assigning' || round.status === 'playing' || round.status === 'scoring',
  );
  const adminRailWidth = adminRailCollapsed ? 64 : 320;

  const startNextGame = async () => {
    if (!auth.token || !stagedSession?.id) return;
    setStartGameSaving(true);
    setStatusError(null);
    try {
      await postJsonAuth(
        `/session-ladder/sessions/${stagedSession.id}/ready-check/start`,
        auth.token,
        {
          duration_seconds: 10,
        },
      );
      const state = await getJsonAuth<{
        rounds: Array<{
          id: number;
          round_index: number;
          seed_payload: string | null;
          status: 'pending' | 'assigning' | 'playing' | 'scoring' | 'finalized';
        }>;
      }>(`/session-ladder/sessions/${stagedSession.id}/state`, auth.token);
      setStagedSessionRounds(state.rounds ?? []);
      await refreshLeagueSummaryAndHistory();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { reason?: string; missing_teams?: number; error?: string };
        if (body.reason === 'SEED_REQUIRED') {
          setStatusError('Next game is missing a variant or seed.');
        } else {
          setStatusError(body.error ?? 'Unable to start game right now.');
        }
      } else if (err instanceof ApiError) {
        setStatusError(
          (err.body as { error?: string })?.error ?? 'Unable to start game right now.',
        );
      } else {
        setStatusError('Unable to start game right now.');
      }
    } finally {
      setStartGameSaving(false);
    }
  };

  const submitReadyCheck = async () => {
    if (!auth.token || !liveSession?.id) return;
    setReadySubmitting(true);
    setPresenceError(null);
    try {
      await postJsonAuth(
        `/session-ladder/sessions/${liveSession.id}/ready-check/respond`,
        auth.token,
        {
          is_ready: true,
        },
      );
      const refreshed = await getJsonAuth<LiveSessionStatePayload>(
        `/session-ladder/sessions/${liveSession.id}/state`,
        auth.token,
      );
      setLiveSessionState({
        rounds: refreshed.rounds ?? [],
        presence: refreshed.presence ?? [],
        round_players: refreshed.round_players ?? [],
        round_results: refreshed.round_results ?? [],
        ready_check: refreshed.ready_check ?? null,
        ready_responses: refreshed.ready_responses ?? [],
      });
    } catch {
      setPresenceError('Unable to confirm readiness right now.');
    } finally {
      setReadySubmitting(false);
    }
  };

  const showDateMeta = !isSessionLadder && (event.starts_at || event.ends_at);
  const showRegistrationMeta = !isSessionLadder && !!registrationWindow.label;
  const variantSuggestions = (() => {
    const q = variantQuery.trim().toLowerCase();
    const filtered = q
      ? variantCatalog.filter(
          (variant) =>
            variant.label.toLowerCase().includes(q) ||
            variant.name.toLowerCase().includes(q) ||
            String(variant.code).includes(q),
        )
      : variantCatalog;
    return filtered.slice(0, 100).map((variant) => ({
      key: variant.code,
      node: <Text variant="body">{variant.name}</Text>,
      value: variant,
    }));
  })();

  return (
    <Main>
      <style>{spinnerKeyframes}</style>
      <PageContainer>
        <Section paddingY="lg">
          <Stack gap="md">
            <Stack gap="sm">
              <Inline align="center" justify="space-between" wrap>
                <Heading level={1}>{event.name}</Heading>
              </Inline>
              <Inline gap="xs" wrap align="center">
                {showDateMeta ? (
                  <Pill size="sm" variant="accent">
                    {formatDateRange(event.starts_at, event.ends_at)}
                  </Pill>
                ) : null}
                {showRegistrationMeta ? (
                  <Pill
                    size="sm"
                    variant={registrationWindow.variant === 'accent' ? 'accent' : 'default'}
                  >
                    {registrationWindow.label}
                  </Pill>
                ) : null}
                {event.event_status === 'LIVE' ? (
                  <Pill size="sm" variant="accent">
                    Live
                  </Pill>
                ) : null}
                {event.event_status === 'COMPLETE' ? (
                  <Pill size="sm" variant="default">
                    Complete
                  </Pill>
                ) : null}
              </Inline>
              <Tabs
                items={
                  isSessionLadder
                    ? [
                        {
                          key: 'overview',
                          label: 'Overview',
                          active: leagueTab === 'overview',
                          onSelect: () => setLeagueTab('overview'),
                        },
                        {
                          key: 'results',
                          label: 'Results',
                          active: leagueTab === 'results',
                          onSelect: () => setLeagueTab('results'),
                        },
                      ]
                    : [
                        {
                          key: 'overview',
                          label: 'Overview',
                          active: true,
                          onSelect: () => undefined,
                        },
                        ...(isChallenge
                          ? [
                              {
                                key: 'stats',
                                label: 'Stats',
                                active: false,
                                onSelect: () => navigate(`/events/${event.slug}/stats`),
                              },
                            ]
                          : []),
                      ]
                }
              />
            </Stack>

            <Inline gap="md" align="start" wrap>
              <Stack
                gap="md"
                style={{ flex: canManageLeague && isSessionLadder ? '1 1 0' : '1 1 100%' }}
              >
                {(!isSessionLadder || leagueTab === 'overview') && (
                  <Card variant="outline" separated>
                    <CardBody>
                      {isOpenEvent && !showFullOverview ? (
                        <Stack gap="sm">
                          <MarkdownRenderer
                            markdown={firstHeadingSectionMarkdown(
                              event.long_description || event.short_description || '',
                            )}
                          />
                          <Inline>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowFullOverview(true)}
                            >
                              Show full details
                            </Button>
                          </Inline>
                        </Stack>
                      ) : (
                        <Stack gap="sm">
                          <MarkdownRenderer
                            markdown={event.long_description || event.short_description || ''}
                          />
                          {isOpenEvent && (
                            <Inline>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowFullOverview(false)}
                              >
                                Hide details
                              </Button>
                            </Inline>
                          )}
                        </Stack>
                      )}
                    </CardBody>
                  </Card>
                )}

                {isSessionLadder ? (
                  <>
                    {leagueTab === 'overview' && isLeagueLive ? (
                      <Stack gap="md">
                        <Card variant="outline" separated>
                          <CardHeader>
                            <Inline justify="space-between" align="center" wrap>
                              <Heading level={3}>Participants</Heading>
                              <Inline gap="xs" align="center" wrap>
                                {myTeamPageHref ? (
                                  <Button as={Link} to={myTeamPageHref} variant="primary" size="sm">
                                    Go to Team Page
                                  </Button>
                                ) : null}
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  disabled={
                                    presenceSaving || !isLeagueLive || !auth.user || !liveSession
                                  }
                                  onClick={() =>
                                    void setMyPresence(isJoinedLiveSession ? 'offline' : 'online')
                                  }
                                >
                                  {presenceSaving
                                    ? 'Saving...'
                                    : isJoinedLiveSession
                                      ? 'Leave'
                                      : 'Join'}
                                </Button>
                              </Inline>
                            </Inline>
                          </CardHeader>
                          <CardBody>
                            <Stack gap="sm">
                              {presenceError && <Alert variant="error" message={presenceError} />}
                              {!isLeagueLive ? (
                                <Text variant="muted">League is not live yet.</Text>
                              ) : !liveSession ? (
                                <Text variant="muted">No live session right now.</Text>
                              ) : !auth.user ? (
                                <Text variant="muted">Log in to join this session.</Text>
                              ) : (liveSessionState?.presence ?? []).filter(
                                  (p) => p.state === 'online',
                                ).length === 0 ? (
                                <Text variant="muted">No active participants yet.</Text>
                              ) : (
                                <Inline gap="xs" wrap>
                                  {(liveSessionState?.presence ?? [])
                                    .filter((p) => p.state === 'online')
                                    .map((p) => {
                                      const userStyle = directoryById.get(p.user_id);
                                      const pill = (
                                        <UserPill
                                          name={p.display_name}
                                          color={userStyle?.color_hex}
                                          textColor={userStyle?.text_color}
                                          size="sm"
                                          as={canManageLeague ? 'button' : 'span'}
                                          type={canManageLeague ? 'button' : undefined}
                                          interactive={canManageLeague}
                                          disabled={
                                            (canManageLeague &&
                                              presenceRemovingUserId === p.user_id) ||
                                            (canManageLeague && presenceSaving)
                                          }
                                          onClick={
                                            canManageLeague
                                              ? () => void removeParticipant(p.user_id)
                                              : undefined
                                          }
                                          style={
                                            canManageLeague ? { cursor: 'pointer' } : undefined
                                          }
                                        />
                                      );
                                      if (!canManageLeague) return pill;
                                      return (
                                        <Tooltip
                                          key={p.user_id}
                                          content="Remove from active players"
                                        >
                                          {pill}
                                        </Tooltip>
                                      );
                                    })}
                                </Inline>
                              )}
                            </Stack>
                          </CardBody>
                        </Card>

                        <Card variant="outline" separated>
                          <CardHeader>
                            <Inline justify="space-between" align="center" wrap>
                              <Heading level={3}>Games</Heading>
                              <Tabs
                                items={liveRoundsSorted.map((round) => ({
                                  key: `round-${round.id}`,
                                  label: `Game ${round.round_index}`,
                                  active: gamesTab === `round-${round.id}`,
                                  disabled: round.id === blockedOngoingRoundIdForViewer,
                                  onSelect: () => {
                                    if (round.id === blockedOngoingRoundIdForViewer) return;
                                    setGamesTab(`round-${round.id}`);
                                  },
                                }))}
                              />
                            </Inline>
                          </CardHeader>
                          <CardBody>
                            {visibleGameRounds.length === 0 ? (
                              <Text variant="muted">No games in this session yet.</Text>
                            ) : (
                              <LeagueGameBlocks
                                round={
                                  visibleGameRounds.find((r) => `round-${r.id}` === gamesTab) ??
                                  visibleGameRounds[visibleGameRounds.length - 1]
                                }
                                roundPlayers={liveSessionState?.round_players ?? []}
                                roundResults={liveSessionState?.round_results ?? []}
                                ratingHistory={ratingHistory}
                                directoryById={directoryById}
                              />
                            )}
                          </CardBody>
                        </Card>
                      </Stack>
                    ) : leagueTab === 'results' ? (
                      <Card variant="outline" separated>
                        <CardHeader>
                          <Inline justify="space-between" align="center" wrap>
                            <Heading level={3}>Results</Heading>
                            <Tabs
                              items={[
                                {
                                  key: 'standings',
                                  label: 'Standings',
                                  active: resultsTab === 'standings',
                                  onSelect: () => setResultsTab('standings'),
                                },
                                ...(resultsSummary?.sessions ?? []).map((s) => ({
                                  key: `session-${s.id}`,
                                  label: `Session ${s.session_index}`,
                                  active: resultsTab === `session-${s.id}`,
                                  onSelect: () => setResultsTab(`session-${s.id}`),
                                })),
                              ]}
                            />
                          </Inline>
                        </CardHeader>
                        <CardBody>
                          <LeagueResultsTables summary={resultsSummary} resultsTab={resultsTab} />
                        </CardBody>
                      </Card>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Card variant="outline" separated>
                      <CardHeader>
                        <Inline align="center" justify="space-between" wrap>
                          <Heading level={3}>Teams</Heading>
                          <Button
                            variant={registrationWindow.canRegister ? 'primary' : 'secondary'}
                            size="md"
                            onClick={() => {
                              if (!registrationWindow.canRegister) return;
                              setRegisterError(null);
                              setShowRegister(true);
                            }}
                            disabled={!registrationWindow.canRegister}
                            title={
                              !registrationWindow.canRegister
                                ? 'Registration for this event is closed or not yet open'
                                : undefined
                            }
                          >
                            Register a Team
                          </Button>
                        </Inline>
                      </CardHeader>
                      <CardBody>
                        <Inline
                          gap="sm"
                          wrap
                          align="center"
                          style={{ marginBottom: 'var(--ds-space-sm)' }}
                        >
                          {[2, 3, 4, 5, 6].map((size) => {
                            const isActive = parsedTeamSize === size;
                            const target =
                              size === 3
                                ? `/events/${event.slug}`
                                : `/events/${event.slug}/${size}`;
                            return (
                              <Link
                                key={size}
                                to={target}
                                className={`pill ${isActive ? 'pill--accent' : ''}`}
                              >
                                {size} Player
                              </Link>
                            );
                          })}
                        </Inline>

                        {teamsLoading && <Text variant="muted">Loading teams…</Text>}
                        {teamsError && <Text variant="body">{teamsError}</Text>}

                        {!teamsLoading && !teamsError && (
                          <>
                            {teams.filter((t) => t.team_size === parsedTeamSize).length === 0 ? (
                              <Text variant="muted">No {parsedTeamSize}-player teams yet.</Text>
                            ) : (
                              <Table>
                                <Table.Thead>
                                  <Table.Tr>
                                    <Table.Th>Name</Table.Th>
                                    <Table.Th style={{ textAlign: 'right' }}>Games</Table.Th>
                                    <Table.Th style={{ textAlign: 'right' }}>Win Rate</Table.Th>
                                    <Table.Th style={{ textAlign: 'right' }}>Avg BDR</Table.Th>
                                    <Table.Th style={{ textAlign: 'right' }}>Avg Score</Table.Th>
                                  </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                  {teams
                                    .filter((t) => t.team_size === parsedTeamSize)
                                    .map((team) => {
                                      const completed = team.completed_games ?? 0;
                                      const perfect = team.perfect_games ?? 0;
                                      const winRate =
                                        completed > 0
                                          ? `${Math.round((perfect / completed) * 100)}%`
                                          : '—';
                                      const avgBdr =
                                        team.avg_bdr != null
                                          ? Number(team.avg_bdr).toFixed(2)
                                          : '—';
                                      const avgScore =
                                        team.avg_score != null
                                          ? Number(team.avg_score).toFixed(2)
                                          : '—';
                                      return (
                                        <Table.Tr
                                          key={team.id}
                                          style={{ borderTop: '1px solid var(--ds-color-border)' }}
                                        >
                                          <Table.Td style={{ fontSize: '0.875rem' }}>
                                            <Link
                                              to={`/events/${event.slug}/teams/${team.id}`}
                                              style={{
                                                fontWeight: 600,
                                                color: '#1d4ed8',
                                                textDecoration: 'none',
                                              }}
                                            >
                                              {team.name}
                                            </Link>
                                          </Table.Td>
                                          <Table.Td
                                            style={{
                                              fontSize: '0.875rem',
                                              textAlign: 'right',
                                              color: 'var(--ds-color-text-muted)',
                                            }}
                                          >
                                            {completed} / {team.total_templates ?? '—'}
                                          </Table.Td>
                                          <Table.Td
                                            style={{
                                              fontSize: '0.875rem',
                                              textAlign: 'right',
                                              color: 'var(--ds-color-text-muted)',
                                            }}
                                          >
                                            {winRate}
                                          </Table.Td>
                                          <Table.Td
                                            style={{
                                              fontSize: '0.875rem',
                                              textAlign: 'right',
                                              color: 'var(--ds-color-text-muted)',
                                            }}
                                          >
                                            {avgBdr}
                                          </Table.Td>
                                          <Table.Td
                                            style={{
                                              fontSize: '0.875rem',
                                              textAlign: 'right',
                                              color: 'var(--ds-color-text-muted)',
                                            }}
                                          >
                                            {avgScore}
                                          </Table.Td>
                                        </Table.Tr>
                                      );
                                    })}
                                </Table.Tbody>
                              </Table>
                            )}
                          </>
                        )}
                      </CardBody>
                    </Card>
                  </>
                )}
              </Stack>

              {isSessionLadder && canManageLeague ? (
                <Card
                  variant="outline"
                  separated
                  style={{
                    flex: `0 0 ${adminRailWidth}px`,
                    width: `${adminRailWidth}px`,
                    position: 'sticky',
                    top: '1rem',
                    zIndex: 2,
                  }}
                >
                  {adminRailCollapsed ? (
                    <CardBody style={{ padding: '0.2rem' }}>
                      <Inline justify="center" align="center">
                        <UnstyledButton
                          onClick={() => setAdminRailCollapsed(false)}
                          title="Expand admin controls"
                          style={{
                            cursor: 'pointer',
                            fontSize: '1.6rem',
                            lineHeight: 1,
                            userSelect: 'none',
                            padding: '0.15rem 0.25rem',
                          }}
                        >
                          ⚙
                        </UnstyledButton>
                      </Inline>
                    </CardBody>
                  ) : (
                    <>
                      <CardHeader>
                        <UnstyledButton
                          onClick={() => setAdminRailCollapsed(true)}
                          title="Collapse admin controls"
                          style={{ cursor: 'pointer' }}
                        >
                          <Heading level={3} style={{ margin: 0 }}>
                            Admin Controls ⚙
                          </Heading>
                        </UnstyledButton>
                      </CardHeader>
                      <CardBody>
                        <Stack gap="sm">
                          <Inline align="center" justify="space-between" gap="sm" wrap>
                            <ToggleSwitch
                              checked={Boolean(isSessionLive)}
                              disabled={statusSaving}
                              label={isSessionLive ? 'Live' : 'Off'}
                              onChange={(e) => {
                                const nextChecked = e.currentTarget.checked;
                                if (!nextChecked && isSessionLive) {
                                  setSessionToggleConfirmOpen(true);
                                  return;
                                }
                                if (nextChecked) {
                                  void setSessionLive(true);
                                }
                              }}
                            />
                            <Button
                              variant="secondary"
                              disabled={
                                statusSaving ||
                                startGameSaving ||
                                !isSessionLive ||
                                pendingRounds.length === 0 ||
                                Boolean(openReadyCheck)
                              }
                              onClick={() => {
                                if (activeRound) {
                                  setStartGameConfirmOpen(true);
                                  return;
                                }
                                void startNextGame();
                              }}
                            >
                              {startGameSaving
                                ? 'Starting…'
                                : openReadyCheck
                                  ? 'Ready Check…'
                                  : 'Start Game'}
                            </Button>
                          </Inline>
                          {statusError && <Alert variant="error" message={statusError} />}
                          <Divider />

                          {stagedSession ? (
                            <>
                              <Heading
                                level={4}
                              >{`Session ${stagedSession.session_index}`}</Heading>
                              {orderedRounds.length === 0 ? (
                                <Text variant="muted">No games yet.</Text>
                              ) : (
                                <DndContext
                                  collisionDetection={closestCenter}
                                  onDragStart={handleQueuedDragStart}
                                  onDragEnd={handleQueuedDragEnd}
                                >
                                  <SortableContext
                                    items={pendingRounds.map((round) => round.id)}
                                    strategy={verticalListSortingStrategy}
                                  >
                                    <Stack gap="xs">
                                      {orderedRounds.map((round) =>
                                        round.status === 'pending' ? (
                                          <SortableQueuedRoundPill
                                            key={round.id}
                                            round={round}
                                            draggingRoundId={draggingRoundId}
                                          />
                                        ) : (
                                          <StaticRoundPill key={round.id} round={round} />
                                        ),
                                      )}
                                    </Stack>
                                  </SortableContext>
                                </DndContext>
                              )}
                              <Inline>
                                <Pill
                                  as="button"
                                  size="sm"
                                  variant="accent"
                                  type="button"
                                  interactive
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => {
                                    const selected = variantCatalog.find(
                                      (v) => v.code === selectedVariantCode,
                                    );
                                    setVariantQuery(selected?.name ?? '');
                                    setCreateGameModalOpen(true);
                                  }}
                                >
                                  + Create Game
                                </Pill>
                              </Inline>
                            </>
                          ) : (
                            <Button
                              variant="secondary"
                              onClick={() => void createSession()}
                              disabled={createSessionSaving}
                            >
                              {createSessionSaving ? 'Saving…' : 'Create Session'}
                            </Button>
                          )}
                          {sessionError && <Alert variant="error" message={sessionError} />}
                          <Divider />
                          <Button
                            variant="ghost"
                            onClick={() => setEndLeagueConfirmOpen(true)}
                            disabled={statusSaving}
                          >
                            End League
                          </Button>
                        </Stack>
                      </CardBody>
                    </>
                  )}
                </Card>
              ) : null}
            </Inline>
          </Stack>
        </Section>
      </PageContainer>

      {!isSessionLadder && showRegister && (
        <RegisterModal
          eventSlug={event.slug}
          eventName={event.name}
          enforceExactTeamSize={Boolean(event.enforce_exact_team_size)}
          refetchTeams={refetchTeams}
          auth={auth}
          directory={directory}
          memberships={memberships}
          onClose={() => {
            setShowRegister(false);
            setRegisterError(null);
          }}
          onSuccess={() => {
            setRegisterError(null);
          }}
          onError={(msg) => {
            setRegisterError(msg);
          }}
        />
      )}
      {!isSessionLadder && registerError && <Alert variant="error" message={registerError} />}

      <Modal
        open={sessionToggleConfirmOpen}
        onClose={() => setSessionToggleConfirmOpen(false)}
        maxWidth="440px"
      >
        <Stack gap="md">
          <Heading level={4}>Are you sure you want to end the session?</Heading>
          <Inline justify="end" gap="sm" wrap>
            <Button variant="ghost" onClick={() => setSessionToggleConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setSessionToggleConfirmOpen(false);
                void setSessionLive(false);
              }}
            >
              End Session
            </Button>
          </Inline>
        </Stack>
      </Modal>

      <Modal
        open={startGameConfirmOpen}
        onClose={() => setStartGameConfirmOpen(false)}
        maxWidth="440px"
      >
        <Stack gap="md">
          <Heading level={4}>End current game and start the next one?</Heading>
          <Text variant="muted">
            Teams without submitted scores in the current game will be recorded as 0/FF.
          </Text>
          <Inline justify="end" gap="sm" wrap>
            <Button variant="ghost" onClick={() => setStartGameConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setStartGameConfirmOpen(false);
                void startNextGame();
              }}
            >
              End and Start Next
            </Button>
          </Inline>
        </Stack>
      </Modal>

      <Modal open={shouldShowAwakePrompt} onClose={() => undefined} maxWidth="420px">
        <Stack gap="md">
          <Heading level={4}>Confirm participation</Heading>
          <Text variant="body">A new game is starting. Confirm within 10 seconds to stay in.</Text>
          <Inline justify="end">
            <Button
              variant="secondary"
              onClick={() => void submitReadyCheck()}
              disabled={readySubmitting}
            >
              {readySubmitting ? 'Confirming…' : "I'm awake"}
            </Button>
          </Inline>
        </Stack>
      </Modal>

      <Modal
        open={endLeagueConfirmOpen}
        onClose={() => setEndLeagueConfirmOpen(false)}
        maxWidth="440px"
      >
        <Stack gap="md">
          <Heading level={4}>Are you sure you want to end the league?</Heading>
          <Inline justify="end" gap="sm" wrap>
            <Button variant="ghost" onClick={() => setEndLeagueConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setEndLeagueConfirmOpen(false);
                void endLeague();
              }}
            >
              End League
            </Button>
          </Inline>
        </Stack>
      </Modal>

      <Modal
        open={createGameModalOpen}
        onClose={() => setCreateGameModalOpen(false)}
        maxWidth="440px"
      >
        <Stack gap="sm">
          <Heading level={4}>Create Game</Heading>
          <InputContainer label="Variant">
            <SearchSelect<VariantCatalogItem>
              value={variantQuery}
              onChange={(next) => {
                setVariantQuery(next);
                setSelectedVariantCode(null);
              }}
              suggestions={variantSuggestions}
              onSelect={(value) => {
                setSelectedVariantCode(value.code);
                setVariantQuery(value.name);
              }}
              blurOnSelect
              placeholder={variantCatalog.length > 0 ? 'Search variants' : 'Loading variants...'}
              disabled={variantCatalog.length === 0 || queueGameSaving}
            />
          </InputContainer>
          <InputContainer label="Seed">
            <Input
              value={queueSeedInput}
              onChange={(e) => setQueueSeedInput(e.target.value)}
              placeholder="Game seed"
              fullWidth
            />
          </InputContainer>
          <Inline justify="end" gap="sm" wrap>
            <Button variant="ghost" onClick={() => setCreateGameModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={() => void queueGame()} disabled={queueGameSaving}>
              {queueGameSaving ? 'Saving…' : 'Create Game'}
            </Button>
          </Inline>
        </Stack>
      </Modal>
    </Main>
  );
}
