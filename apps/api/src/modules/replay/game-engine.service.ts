// Game engine service: wraps the @hanabi-live/game package to extract KPIs
// from a completed game export.
//
// The export gives us:
//   - deck:    { suitIndex, rank }[] — card identities in deal order (card order = index)
//   - actions: { type, target, value }[] — player actions
//              type 0 = Play, 1 = Discard, 2 = Color Clue, 3 = Rank Clue, 4 = Game Over
//              For play/discard: target = card order
//              For clues: target = player being clued, value = clue value
//
// We need to expand these into the full GameAction[] the engine expects, including
// draw actions and (for bombs) strike actions.
//
// Bomb detection: ActionPlay always adds to play stacks and scores a point, so we
// must detect bombs ourselves before feeding actions to the engine.  A play is a
// bomb when the played card's rank is NOT in getNextPlayableRanks for its suit.
// Bombs are sent as ActionDiscard{failed:true} + ActionStrike.
//
// NOTE: For the "Orange" variant (play/discard inverted), bomb detection logic
// differs — plays always go to trash and discards go to stacks.  When the engine
// adds support for this variant, detection should use variant.funnels-style flags.
//
// BDR (Bottom Deck Risk): counted per discard/bomb event.  A discard of card C
// increments BDR when ALL of the following hold:
//   1. C has at least one twin (5s and other single-copy cards are excluded).
//   2. After this discard, exactly one copy of C remains (not yet played or discarded).
//   3. C is not trash: rank has already been played on its suit's stack, OR some
//      intermediate rank between the current stack top and C's rank has been fully
//      discarded, making C unreachable.
//   4. The remaining copy is not visible in any player's hand.
// Bombs (failed plays) are evaluated the same way as voluntary discards.

import {
  getInitialGameState,
  gameReducer,
  getVariantByID,
  getCardsPerHand,
  getNextPlayableRanks,
} from '@hanabi-live/game';
import type { GameMetadata } from '@hanabi-live/game';
import type { GameAction } from '@hanabi-live/game';
import type { PlayerIndex } from '@hanabi-live/game';
import type { SuitIndex } from '@hanabi-live/game';
import type { Rank } from '@hanabi-live/game';
import type { ColorIndex } from '@hanabi-live/game';
import type { RankClueNumber } from '@hanabi-live/game';
import type { MsgClue } from '@hanabi-live/game';
import type { CardOrder } from '@hanabi-live/game';
import type { NumPlayers } from '@hanabi-live/game';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportAction = {
  type: number; // 0=Play, 1=Discard, 2=ColorClue, 3=RankClue, 4=GameOver
  target: number;
  value: number;
};

export type ExportDeckCard = {
  suitIndex: number;
  rank: number;
};

export type GameKPIs = {
  score: number;
  strikes: number;
  cluesRemaining: number;
  bottomDeckRisk: number;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXPORT_PLAY = 0;
const EXPORT_DISCARD = 1;
const EXPORT_COLOR_CLUE = 2;
const EXPORT_RANK_CLUE = 3;

// ---------------------------------------------------------------------------
// BDR helpers
// ---------------------------------------------------------------------------

function ckey(suitIndex: number, rank: number): string {
  return `${suitIndex}:${rank}`;
}

/**
 * Returns true if card (suitIndex, rank) is currently trash:
 *   - rank has already been played on its suit stack, OR
 *   - some intermediate rank between the current stack top and this rank has
 *     been fully consumed (played + discarded), making this rank unreachable.
 *
 * Called AFTER the current discard has been applied to state and usedCounts.
 * For intermediate ranks (above the stack top), usedCounts equals discarded
 * counts since none have been played yet.
 */
function isTrash(
  suitIndex: number,
  rank: number,
  state: ReturnType<typeof getInitialGameState>,
  usedCounts: Map<string, number>,
  originalCounts: Map<string, number>,
): boolean {
  const stackHeight = state.playStacks[suitIndex as SuitIndex]?.length ?? 0;

  if (rank <= stackHeight) return true;

  for (let r = stackHeight + 1; r < rank; r++) {
    const key = ckey(suitIndex, r);
    const original = originalCounts.get(key) ?? 0;
    const used = usedCounts.get(key) ?? 0;
    if (original - used <= 0) return true;
  }

  return false;
}

/**
 * Returns true if any copy of (suitIndex, rank) is currently in a player's hand.
 * Called AFTER the discard action has been applied, so the discarded card is
 * already removed from state.hands.
 */
function isVisibleInHands(
  suitIndex: number,
  rank: number,
  deck: ExportDeckCard[],
  hands: ReadonlyArray<readonly number[]>,
): boolean {
  for (const hand of hands) {
    for (const cardOrder of hand) {
      const card = deck[cardOrder];
      if (card && card.suitIndex === suitIndex && card.rank === rank) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Returns 1 if this discard event is a BDR, 0 otherwise.
 * Must be called AFTER the discard action has been applied to state and
 * usedCounts has been incremented for the discarded card.
 */
function computeBdrForDiscard(
  suitIndex: number,
  rank: number,
  state: ReturnType<typeof getInitialGameState>,
  deck: ExportDeckCard[],
  usedCounts: Map<string, number>,
  originalCounts: Map<string, number>,
): number {
  const key = ckey(suitIndex, rank);
  const original = originalCounts.get(key) ?? 0;

  // Single-copy cards (5s in most variants) have no twins → no BDR
  if (original <= 1) return 0;

  const used = usedCounts.get(key) ?? 0;
  const remaining = original - used;

  // BDR only when exactly one copy remains (could be at the bottom of the deck)
  if (remaining !== 1) return 0;

  // Trash cards pose no risk
  if (isTrash(suitIndex, rank, state, usedCounts, originalCounts)) return 0;

  // If the remaining copy is visible in a hand, the team can see it is safe
  if (isVisibleInHands(suitIndex, rank, deck, state.hands)) return 0;

  return 1;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Drives the hanabi-live game engine through a completed game export and
 * returns the derived KPIs: score, strikes, clues remaining, and bottom-deck
 * risk (BDR).
 *
 * BDR counts the number of discard/bomb events where the discarded card had
 * exactly one remaining copy that was neither visible in a player's hand nor
 * already rendered unreachable.  See module header for full definition.
 *
 * @param variantId  hanab.live variant ID (0 = No Variant)
 * @param numPlayers number of players in the game
 * @param playerNames display names in seat order (used for metadata)
 * @param actions    raw export actions array
 * @param deck       raw export deck array (index = card order, full shuffled deck)
 */
export function extractGameKPIs(
  variantId: number,
  numPlayers: number,
  playerNames: string[],
  actions: ExportAction[],
  deck: ExportDeckCard[],
): GameKPIs {
  const variant = getVariantByID(variantId);

  const options = {
    numPlayers: numPlayers as NumPlayers,
    variantName: variant.name,
    startingPlayer: 0 as PlayerIndex,
    timed: false,
    timeBase: 0,
    timePerTurn: 0,
    speedrun: false,
    cardCycle: false,
    deckPlays: false,
    emptyClues: false,
    oneExtraCard: false,
    oneLessCard: false,
    allOrNothing: false,
    detrimentalCharacters: false,
  };

  // characterAssignments and characterMetadata must be Tuple<…, NumPlayers>
  // We cast through unknown since we're building them dynamically.
  const characterAssignments = new Array<null>(numPlayers).fill(null) as unknown as Parameters<
    typeof getInitialGameState
  >[0]['characterAssignments'];
  const characterMetadata = new Array<number>(numPlayers).fill(0) as unknown as Parameters<
    typeof getInitialGameState
  >[0]['characterMetadata'];
  const names = playerNames as unknown as Parameters<typeof getInitialGameState>[0]['playerNames'];

  const metadata: GameMetadata = {
    ourUsername: '',
    options,
    playerNames: names,
    ourPlayerIndex: 0 as PlayerIndex,
    characterAssignments,
    characterMetadata,
    minEfficiency: 0,
    hardVariant: false,
    hasCustomSeed: false,
    seed: '',
  };

  const cardsPerHand = getCardsPerHand(options);
  let state = getInitialGameState(metadata);

  // Pre-compute how many copies of each (suitIndex, rank) exist in the full deck.
  // The export deck must be the complete shuffled deck (all cards, not just drawn ones).
  const originalCounts = new Map<string, number>();
  for (const card of deck) {
    const key = ckey(card.suitIndex, card.rank);
    originalCounts.set(key, (originalCounts.get(key) ?? 0) + 1);
  }

  // Tracks consumed copies: played onto stacks + discarded (including bombs).
  const usedCounts = new Map<string, number>();

  let bdr = 0;

  // ------------------------------------------------------------------
  // Initial deal: deal cards round-robin to all players
  // Card order 0 → player 0, order 1 → player 1, …, then wrap around.
  // ------------------------------------------------------------------
  let deckPos = 0;
  const initialCards = numPlayers * cardsPerHand;
  for (let i = 0; i < initialCards; i++) {
    const card = deck[deckPos];
    if (!card) break;
    const drawAction: GameAction = {
      type: 'draw',
      playerIndex: (deckPos % numPlayers) as PlayerIndex,
      order: deckPos as CardOrder,
      suitIndex: card.suitIndex as SuitIndex,
      rank: card.rank as Rank,
    };
    state = gameReducer(state, drawAction, true, false, false, false, metadata);
    deckPos++;
  }

  // ------------------------------------------------------------------
  // Process player actions
  // ------------------------------------------------------------------
  for (const action of actions) {
    const currentPlayerIndex = state.turn.currentPlayerIndex;
    if (currentPlayerIndex === null) break; // game ended

    if (action.type === EXPORT_PLAY) {
      const cardOrder = action.target;
      const card = deck[cardOrder];
      if (!card) continue;

      const suitIndex = card.suitIndex as SuitIndex;
      const rank = card.rank as Rank;
      const isValidPlay = checkIsValidPlay(state, suitIndex, rank, variant);

      if (isValidPlay) {
        const playAction: GameAction = {
          type: 'play',
          playerIndex: currentPlayerIndex,
          order: cardOrder as CardOrder,
          suitIndex,
          rank,
        };
        state = gameReducer(state, playAction, true, false, false, false, metadata);
        // Track the played card as consumed (does not trigger BDR)
        const key = ckey(card.suitIndex, card.rank);
        usedCounts.set(key, (usedCounts.get(key) ?? 0) + 1);
      } else {
        // Bomb: misplay goes to discard pile with failed=true, then a strike
        const discardAction: GameAction = {
          type: 'discard',
          playerIndex: currentPlayerIndex,
          order: cardOrder as CardOrder,
          suitIndex,
          rank,
          failed: true,
        };
        state = gameReducer(state, discardAction, true, false, false, false, metadata);

        // Evaluate BDR after the state reflects the discard
        const key = ckey(card.suitIndex, card.rank);
        usedCounts.set(key, (usedCounts.get(key) ?? 0) + 1);
        bdr += computeBdrForDiscard(
          card.suitIndex,
          card.rank,
          state,
          deck,
          usedCounts,
          originalCounts,
        );

        const strikeNum = state.strikes.length as 1 | 2 | 3;
        const strikeAction: GameAction = {
          type: 'strike',
          num: strikeNum,
          order: cardOrder as CardOrder,
          turn: state.turn.turnNum,
        };
        state = gameReducer(state, strikeAction, true, false, false, false, metadata);
      }

      [state, deckPos] = drawNext(state, deck, deckPos, currentPlayerIndex, metadata);
    } else if (action.type === EXPORT_DISCARD) {
      const cardOrder = action.target;
      const card = deck[cardOrder];
      if (!card) continue;

      const discardAction: GameAction = {
        type: 'discard',
        playerIndex: currentPlayerIndex,
        order: cardOrder as CardOrder,
        suitIndex: card.suitIndex as SuitIndex,
        rank: card.rank as Rank,
        failed: false,
      };
      state = gameReducer(state, discardAction, true, false, false, false, metadata);

      // Evaluate BDR after the state reflects the discard
      const key = ckey(card.suitIndex, card.rank);
      usedCounts.set(key, (usedCounts.get(key) ?? 0) + 1);
      bdr += computeBdrForDiscard(
        card.suitIndex,
        card.rank,
        state,
        deck,
        usedCounts,
        originalCounts,
      );

      [state, deckPos] = drawNext(state, deck, deckPos, currentPlayerIndex, metadata);
    } else if (action.type === EXPORT_COLOR_CLUE || action.type === EXPORT_RANK_CLUE) {
      // Build MsgClue as a discriminated union to satisfy the type checker
      const clue: MsgClue =
        action.type === EXPORT_COLOR_CLUE
          ? { type: 0, value: action.value as ColorIndex }
          : { type: 1, value: action.value as RankClueNumber };
      const clueAction: GameAction = {
        type: 'clue',
        clue,
        giver: currentPlayerIndex,
        list: [],
        target: action.target as PlayerIndex,
        ignoreNegative: false,
      };
      state = gameReducer(state, clueAction, true, false, false, false, metadata);
    }
    // type 4 (GameOver) — skip; game ends when all actions are processed
  }

  return {
    score: state.score,
    strikes: state.strikes.length,
    cluesRemaining: state.clueTokens,
    bottomDeckRisk: bdr,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true when playing (suitIndex, rank) would advance that suit's play stack. */
function checkIsValidPlay(
  state: ReturnType<typeof getInitialGameState>,
  suitIndex: SuitIndex,
  rank: Rank,
  variant: ReturnType<typeof getVariantByID>,
): boolean {
  const playStack = state.playStacks[suitIndex];
  const playStackDir = state.playStackDirections[suitIndex];
  if (!playStack || !playStackDir) return false;
  const nextRanks = getNextPlayableRanks(
    suitIndex,
    playStack,
    playStackDir,
    state.playStackStarts,
    variant,
    state.deck,
  );
  return nextRanks.includes(rank);
}

/**
 * Draws the next card for `playerIndex` if the deck isn't empty.
 * Returns [newState, newDeckPos].
 */
function drawNext(
  state: ReturnType<typeof getInitialGameState>,
  deck: ExportDeckCard[],
  deckPos: number,
  playerIndex: PlayerIndex,
  metadata: GameMetadata,
): [ReturnType<typeof getInitialGameState>, number] {
  const card = deck[deckPos];
  if (!card || state.cardsRemainingInTheDeck <= 0) return [state, deckPos];

  const drawAction: GameAction = {
    type: 'draw',
    playerIndex,
    order: deckPos as CardOrder,
    suitIndex: card.suitIndex as SuitIndex,
    rank: card.rank as Rank,
  };
  return [gameReducer(state, drawAction, true, false, false, false, metadata), deckPos + 1];
}
