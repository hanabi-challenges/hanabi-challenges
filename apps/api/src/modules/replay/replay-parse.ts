export type ReplayHistoryGameLike = {
  id?: string | number | null;
  gameId?: string | number | null;
  game_id?: string | number | null;
};

export function extractReplayExportPlayers(payload: unknown): string[] | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate =
    (payload as { players?: unknown }).players ??
    (payload as { playerNames?: unknown }).playerNames ??
    (payload as { player_names?: unknown }).player_names;
  if (!Array.isArray(candidate)) return null;
  if (!candidate.every((value) => typeof value === 'string' && value.trim().length > 0)) {
    return null;
  }
  return candidate as string[];
}

export function extractReplayHistoryGames<T = ReplayHistoryGameLike>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object') {
    const objectPayload = payload as { games?: unknown; rows?: unknown };
    if (Array.isArray(objectPayload.games)) return objectPayload.games as T[];
    if (Array.isArray(objectPayload.rows)) return objectPayload.rows as T[];
  }
  return [];
}

export function normalizeReplayEndCondition(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
