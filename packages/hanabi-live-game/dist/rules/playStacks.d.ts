import { StackDirection } from "../enums/StackDirection";
import type { CardState } from "../interfaces/CardState";
import type { GameState } from "../interfaces/GameState";
import type { Variant } from "../interfaces/Variant";
import type { Rank } from "../types/Rank";
import type { SuitIndex } from "../types/SuitIndex";
/**
 * Returns an array since it is possible in some variants to have two or more possible cards that
 * are legal next plays.
 */
export declare function getNextPlayableRanks(suitIndex: SuitIndex, playStack: readonly number[], playStackDirection: StackDirection, playStackStarts: GameState["playStackStarts"], variant: Variant, deck: readonly CardState[]): readonly number[];
/** @returns `undefined` if there are no cards played on the stack. */
export declare function getLastPlayedRank(playStack: readonly number[], deck: readonly CardState[]): Rank | null;
export declare function getStackDirection(suitIndex: SuitIndex, playStack: readonly number[], deck: readonly CardState[], variant: Variant): StackDirection;
/** Returns the rank of the bottom card of the stack. */
export declare function getStackStartRank(playStack: readonly number[], deck: readonly CardState[]): Rank | null;
//# sourceMappingURL=playStacks.d.ts.map