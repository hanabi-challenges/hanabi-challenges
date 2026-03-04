export type LeagueResultsSummary = {
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
} | null;

export type RoundStatus = 'pending' | 'assigning' | 'playing' | 'scoring' | 'finalized';

export type SessionRound = {
  id: number;
  round_index: number;
  seed_payload: string | null;
  status: RoundStatus;
};
