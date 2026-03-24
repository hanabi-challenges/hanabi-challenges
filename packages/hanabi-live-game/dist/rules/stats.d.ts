import type { Tuple } from "complete-common";
import { PaceRisk } from "../enums/PaceRisk";
import type { CardNote } from "../interfaces/CardNote";
import type { CardState } from "../interfaces/CardState";
import type { GameState } from "../interfaces/GameState";
import type { Variant } from "../interfaces/Variant";
import type { CardOrder } from "../types/CardOrder";
import type { NumPlayers } from "../types/NumPlayers";
import type { NumSuits } from "../types/NumSuits";
export declare function getMaxScorePerStack(deck: readonly CardState[], playStackDirections: GameState["playStackDirections"], playStackStarts: GameState["playStackStarts"], variant: Variant): Tuple<number, NumSuits>;
/** @returns The number of discards that can happen while still getting the maximum score. */
export declare function getPace(score: number, deckSize: number, maxScore: number, endGameLength: number, gameOver: boolean): number | null;
/** @returns A measure of how risky a discard would be right now, using different heuristics. */
export declare function getPaceRisk(currentPace: number | null, numPlayers: NumPlayers): PaceRisk;
export declare function getStartingDeckSize(numPlayers: NumPlayers, cardsPerHand: number, variant: Variant): number;
/**
 * Calculate the starting pace with the following formula:
 *
 *  ```text
 *  total cards in the deck
 *  + number of turns in the final round
 *  - (number of cards in a player's hand * number of players)
 *  - (stackSize * number of suits)
 *  ```
 *
 * @see https://github.com/hanabi/hanabi.github.io/blob/main/misc/efficiency.md
 */
export declare function getStartingPace(deckSize: number, maxScore: number, endGameLength: number): number;
export declare function getCardsGotten(deck: readonly CardState[], playStacks: GameState["playStacks"], playStackDirections: GameState["playStackDirections"], playStackStarts: GameState["playStackStarts"], playing: boolean, shadowing: boolean, maxScore: number, variant: Variant): number;
/** @returns The number of cards that are only gotten by notes and are not gotten by real clues. */
export declare function getCardsGottenByNotes(deck: readonly CardState[], playStacks: GameState["playStacks"], playStackDirections: GameState["playStackDirections"], playStackStarts: GameState["playStackStarts"], variant: Variant, notes: readonly CardNote[]): number;
/** @returns The minimum amount of efficiency needed in order to win this variant. */
export declare function getMinEfficiency(numPlayers: NumPlayers, endGameLength: number, variant: Variant, cardsPerHand: number): number;
/**
 * @returns The max number of clues that can be spent while getting the max possible score from a
 *          given game state onward (not accounting for the locations of playable cards).
 */
export declare function getCluesStillUsableNotRounded(score: number, scorePerStack: readonly number[], maxScorePerStack: readonly number[], stackSize: number, deckSize: number, endGameLength: number, discardClueTokenValue: number, suitCompleteClueTokenValue: number, currentClues: number): number | null;
export declare function getCluesStillUsable(score: number, scorePerStack: readonly number[], maxScorePerStack: readonly number[], stackSize: number, deckSize: number, endGameLength: number, discardClueTokenValue: number, suitCompleteClueTokenValue: number, currentClues: number): number | null;
/**
 * This is used as the denominator of an efficiency calculation:
 *
 * ```text
 * (8 + floor((starting pace + number of suits - unusable clues) * clues per discard))
 * ```
 *
 * @see https://github.com/hanabi/hanabi.github.io/blob/main/misc/efficiency.md
 */
export declare function getStartingCluesUsable(endGameLength: number, deckSize: number, variant: Variant): number;
export declare function getEfficiency(numCardsGotten: number, potentialCluesLost: number): number;
export declare function getFutureEfficiency(gameState: GameState): number | null;
/**
 * After a discard, it is a "double discard" situation if there is only one other copy of this card
 * and it needs to be played.
 */
export declare function getDoubleDiscardCard(orderOfDiscardedCard: CardOrder, gameState: GameState, variant: Variant): CardOrder | null;
//# sourceMappingURL=stats.d.ts.map