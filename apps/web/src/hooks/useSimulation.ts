import { useEffect, useState } from 'react';
import { getJsonAuth, postJsonAuth, deleteJsonAuth, ApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';

// ---------------------------------------------------------------------------
// Types (mirror stage-simulation.service.ts)
// ---------------------------------------------------------------------------

export type SimulationOptions = {
  teamsPerSize?: number;
};

export type EventSimulationOptions = {
  teamsPerSize?: number;
};

export type EventSimulationSummary = {
  ingested: number;
  skipped: number;
  errors: string[];
  stagesSimulated: number;
};

export type EventSimulationGameResult = {
  result_id: number | null;
  stage_id: number;
  stage_label: string;
  slot_id: number;
  game_index: number;
  slot_nickname: string | null;
  hanabi_live_game_id: number;
  players: string[];
  started_at: string | null;
  played_at: string | null;
  score: number | null;
  bottom_deck_risk: number | null;
  strikes: number | null;
  clues_remaining: number | null;
  team_id: number | null;
  handling: string;
};

export type OptInOptions = {
  playerCount?: number;
  sleepFraction?: number;
};

export type SimulationSummary = {
  ingested: number;
  skipped: number;
  errors: string[];
};

export type OptInSummary = {
  awake: number;
  asleep: number;
  total: number;
};

export type SimulationStatus = {
  optInCount: number;
  teamCount: number;
  resultCount: number;
};

export type SimulationGameResult = {
  result_id: number | null;
  slot_id: number;
  game_index: number;
  slot_nickname: string | null;
  hanabi_live_game_id: number;
  players: string[];
  started_at: string | null;
  played_at: string | null;
  score: number | null;
  bottom_deck_risk: number | null;
  strikes: number | null;
  clues_remaining: number | null;
  team_id: number | null;
  handling: string;
};

// ---------------------------------------------------------------------------
// useSimulationMode — fetch /health once and return the simulation_mode flag
// ---------------------------------------------------------------------------

let _simulationMode: boolean | null = null;
let _fetchInFlight: Promise<boolean> | null = null;

async function fetchSimulationMode(): Promise<boolean> {
  if (_simulationMode !== null) return _simulationMode;
  if (_fetchInFlight) return _fetchInFlight;

  _fetchInFlight = fetch('/health')
    .then((r) => r.json())
    .then((d: { simulation_mode?: boolean }) => {
      _simulationMode = d.simulation_mode ?? false;
      return _simulationMode;
    })
    .catch(() => {
      _simulationMode = false;
      return false;
    });

  return _fetchInFlight;
}

export function useSimulationMode(): boolean {
  const [mode, setMode] = useState<boolean>(_simulationMode ?? false);

  useEffect(() => {
    if (_simulationMode !== null) {
      setMode(_simulationMode);
      return;
    }
    fetchSimulationMode().then(setMode);
  }, []);

  return mode;
}

// ---------------------------------------------------------------------------
// useStageSimulation — trigger, fetch, and clear simulation results
// ---------------------------------------------------------------------------

type State = {
  running: boolean;
  summary: SimulationSummary | null;
  optInSummary: OptInSummary | null;
  status: SimulationStatus | null;
  results: SimulationGameResult[] | null;
  resultsLoading: boolean;
  statusLoading: boolean;
  error: string | null;
};

export function useStageSimulation(eventSlug: string | undefined, stageId: number | undefined) {
  const { token } = useAuth();
  const [state, setState] = useState<State>({
    running: false,
    summary: null,
    optInSummary: null,
    status: null,
    results: null,
    resultsLoading: false,
    statusLoading: false,
    error: null,
  });

  function basePath() {
    return `/events/${encodeURIComponent(eventSlug!)}/stages/${stageId}`;
  }

  /** TEAM stages: run full simulation in one step */
  async function simulate(options?: SimulationOptions): Promise<SimulationSummary | null> {
    if (!eventSlug || !stageId || !token) return null;
    setState((s) => ({ ...s, running: true, error: null, summary: null }));
    try {
      const result = await postJsonAuth<SimulationSummary>(
        `${basePath()}/simulate`,
        token,
        options ?? {},
      );
      setState((s) => ({ ...s, running: false, summary: result }));
      return result;
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Simulation failed')
          : 'Simulation failed';
      setState((s) => ({ ...s, running: false, error: msg }));
      return null;
    }
  }

  /** INDIVIDUAL stages phase 1: populate opt-ins */
  async function simulateOptIns(options?: OptInOptions): Promise<OptInSummary | null> {
    if (!eventSlug || !stageId || !token) return null;
    setState((s) => ({ ...s, running: true, error: null, optInSummary: null }));
    try {
      const result = await postJsonAuth<OptInSummary>(
        `${basePath()}/simulate/opt-ins`,
        token,
        options ?? {},
      );
      setState((s) => ({ ...s, running: false, optInSummary: result }));
      return result;
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Failed to add opt-ins')
          : 'Failed to add opt-ins';
      setState((s) => ({ ...s, running: false, error: msg }));
      return null;
    }
  }

  /** INDIVIDUAL stages phase 2: simulate games for awake QUEUED teams */
  async function simulateGames(): Promise<SimulationSummary | null> {
    if (!eventSlug || !stageId || !token) return null;
    setState((s) => ({ ...s, running: true, error: null, summary: null }));
    try {
      const result = await postJsonAuth<SimulationSummary>(
        `${basePath()}/simulate/games`,
        token,
        {},
      );
      setState((s) => ({ ...s, running: false, summary: result }));
      return result;
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Game simulation failed')
          : 'Game simulation failed';
      setState((s) => ({ ...s, running: false, error: msg }));
      return null;
    }
  }

  async function loadStatus(): Promise<void> {
    if (!eventSlug || !stageId || !token) return;
    setState((s) => ({ ...s, statusLoading: true }));
    try {
      const status = await getJsonAuth<SimulationStatus>(`${basePath()}/simulate/status`, token);
      setState((s) => ({ ...s, statusLoading: false, status }));
    } catch {
      setState((s) => ({ ...s, statusLoading: false }));
    }
  }

  async function loadResults(): Promise<void> {
    if (!eventSlug || !stageId || !token) return;
    setState((s) => ({ ...s, resultsLoading: true, error: null }));
    try {
      const results = await getJsonAuth<SimulationGameResult[]>(
        `${basePath()}/simulate/results`,
        token,
      );
      setState((s) => ({ ...s, resultsLoading: false, results }));
    } catch (err) {
      const msg =
        err instanceof ApiError ? 'Failed to load simulation results' : 'Unexpected error';
      setState((s) => ({ ...s, resultsLoading: false, error: msg }));
    }
  }

  async function clearResults(): Promise<boolean> {
    if (!eventSlug || !stageId || !token) return false;
    setState((s) => ({ ...s, running: true, error: null }));
    try {
      await deleteJsonAuth(`${basePath()}/simulate/results`, token);
      setState((s) => ({
        ...s,
        running: false,
        summary: null,
        optInSummary: null,
        status: null,
        results: null,
      }));
      return true;
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Clear failed')
          : 'Clear failed';
      setState((s) => ({ ...s, running: false, error: msg }));
      return false;
    }
  }

  return {
    ...state,
    simulate,
    simulateOptIns,
    simulateGames,
    loadStatus,
    loadResults,
    clearResults,
  };
}

// ---------------------------------------------------------------------------
// useEventSimulation — event-level simulation across all TEAM stages
// ---------------------------------------------------------------------------

type EventSimState = {
  running: boolean;
  summary: EventSimulationSummary | null;
  results: EventSimulationGameResult[] | null;
  resultsLoading: boolean;
  error: string | null;
};

export function useEventSimulation(eventSlug: string | undefined) {
  const { token } = useAuth();
  const [state, setState] = useState<EventSimState>({
    running: false,
    summary: null,
    results: null,
    resultsLoading: false,
    error: null,
  });

  function basePath() {
    return `/events/${encodeURIComponent(eventSlug!)}`;
  }

  /** Run event-level simulation across all TEAM stages */
  async function simulate(
    options?: EventSimulationOptions,
  ): Promise<EventSimulationSummary | null> {
    if (!eventSlug || !token) return null;
    setState((s) => ({ ...s, running: true, error: null, summary: null }));
    try {
      const result = await postJsonAuth<EventSimulationSummary>(
        `${basePath()}/simulate`,
        token,
        options ?? {},
      );
      setState((s) => ({ ...s, running: false, summary: result }));
      return result;
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Simulation failed')
          : 'Simulation failed';
      setState((s) => ({ ...s, running: false, error: msg }));
      return null;
    }
  }

  async function loadResults(): Promise<void> {
    if (!eventSlug || !token) return;
    setState((s) => ({ ...s, resultsLoading: true, error: null }));
    try {
      const results = await getJsonAuth<EventSimulationGameResult[]>(
        `${basePath()}/simulate/results`,
        token,
      );
      setState((s) => ({ ...s, resultsLoading: false, results }));
    } catch (err) {
      const msg =
        err instanceof ApiError ? 'Failed to load simulation results' : 'Unexpected error';
      setState((s) => ({ ...s, resultsLoading: false, error: msg }));
    }
  }

  async function clearResults(): Promise<boolean> {
    if (!eventSlug || !token) return false;
    setState((s) => ({ ...s, running: true, error: null }));
    try {
      await deleteJsonAuth(`${basePath()}/simulate/results`, token);
      setState((s) => ({ ...s, running: false, summary: null, results: null }));
      return true;
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Clear failed')
          : 'Clear failed';
      setState((s) => ({ ...s, running: false, error: msg }));
      return false;
    }
  }

  return { ...state, simulate, loadResults, clearResults };
}
