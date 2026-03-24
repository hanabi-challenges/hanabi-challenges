import type { Tuple } from "complete-common";
import { StackDirection } from "../../enums/StackDirection";
import type { CardState } from "../../interfaces/CardState";
import type { GameState } from "../../interfaces/GameState";
import type { Variant } from "../../interfaces/Variant";
import type { NumSuits } from "../../types/NumSuits";
import type { Rank } from "../../types/Rank";
import type { SuitIndex } from "../../types/SuitIndex";
/**
 * Returns true if this card still needs to be played in order to get the maximum score (taking the
 * stack direction into account). (Before reaching this function, we have already checked to see if
 * the card has been played.) This function mirrors the server function
 * "variantReversibleNeedsToBePlayed()".
 */
export declare function reversibleIsCardNeededForMaxScore(suitIndex: SuitIndex, rank: Rank, deck: readonly CardState[], playStacks: GameState["playStacks"], playStackDirections: GameState["playStackDirections"], variant: Variant): boolean;
export declare function reversibleGetRanksUsefulForMaxScore(lastPlayed: Rank | null, allDiscardedSet: ReadonlySet<Rank>, direction: StackDirection | undefined): ReadonlySet<Rank>;
/**
 * Calculates what the maximum score is, accounting for stacks that cannot be completed due to
 * discarded cards.
 *
 * This function mirrors the server function "variantReversibleGetMaxScore()", except that it
 * creates a per stack array, instead.
 */
export declare function reversibleGetMaxScorePerStack(deck: readonly CardState[], playStackDirections: GameState["playStackDirections"], variant: Variant): Tuple<number, NumSuits>;
/** This does not mirror any function on the server. */
export declare function reversibleIsCardCritical(suitIndex: SuitIndex, rank: Rank, deck: readonly CardState[], playStackDirections: GameState["playStackDirections"], variant: Variant): boolean;
//# sourceMappingURL=reversible.d.ts.map