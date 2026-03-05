import { describe, expect, it } from 'vitest';
import {
  extractReplayExportPlayers,
  extractReplayHistoryGames,
  normalizeReplayEndCondition,
} from '../../../src/modules/replay/replay-parse';

describe('replay-parse helpers', () => {
  it('extractReplayExportPlayers supports canonical and legacy keys', () => {
    expect(extractReplayExportPlayers({ players: ['a', 'b'] })).toEqual(['a', 'b']);
    expect(extractReplayExportPlayers({ playerNames: ['a', 'b'] })).toEqual(['a', 'b']);
    expect(extractReplayExportPlayers({ player_names: ['a', 'b'] })).toEqual(['a', 'b']);
  });

  it('extractReplayExportPlayers rejects malformed values', () => {
    expect(extractReplayExportPlayers({ players: ['a', 1] })).toBeNull();
    expect(extractReplayExportPlayers({ players: [] })).toEqual([]);
    expect(extractReplayExportPlayers({})).toBeNull();
    expect(extractReplayExportPlayers(null)).toBeNull();
  });

  it('extractReplayHistoryGames supports array, games, and rows wrappers', () => {
    const game = { id: 1 };
    expect(extractReplayHistoryGames([game])).toEqual([game]);
    expect(extractReplayHistoryGames({ games: [game] })).toEqual([game]);
    expect(extractReplayHistoryGames({ rows: [game] })).toEqual([game]);
    expect(extractReplayHistoryGames({})).toEqual([]);
    expect(extractReplayHistoryGames(null)).toEqual([]);
  });

  it('normalizeReplayEndCondition normalizes or returns null', () => {
    expect(normalizeReplayEndCondition(4)).toBe(4);
    expect(normalizeReplayEndCondition('10')).toBe(10);
    expect(normalizeReplayEndCondition(null)).toBeNull();
    expect(normalizeReplayEndCondition(undefined)).toBeNull();
    expect(normalizeReplayEndCondition('nope')).toBeNull();
  });
});
