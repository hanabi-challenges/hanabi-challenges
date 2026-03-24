import type { Tuple } from "complete-common";
import type { CardState } from "../../interfaces/CardState";
import type { GameState } from "../../interfaces/GameState";
import type { Variant } from "../../interfaces/Variant";
import type { NumSuits } from "../../types/NumSuits";
import type { Rank } from "../../types/Rank";
import type { SuitIndex } from "../../types/SuitIndex";
/** Check if the card can still be played in a Sudoku variant. */
export declare function sudokuIsCardNeededForMaxScore(suitIndex: SuitIndex, rank: Rank, deck: readonly CardState[], playStackStarts: GameState["playStackStarts"], variant: Variant): boolean;
/**
 * For Sudoku variants, given a boolean map for which ranks [1, 2, 3, 4, 5] are all discarded,
 * returns an array for these ranks of the longest play sequences starting at these maps (indexed 0
 * through 4), and a boolean stating whether all ranks are still available, i.e. whether the
 * returned array is [5, 5, 5, 5, 5]. This functions mimics the method `sudokuWalkUpAll` from the
 * server file "variants_sudoku.go".
 */
export declare function sudokuWalkUpAll(allDiscardedSet: ReadonlySet<Rank>, variant: Variant): {
    allMax: boolean;
    maxScoresForEachStartingValueOfSuit: Tuple<number, Rank>;
};
/**
 * This function mimics `variantSudokuGetMaxScore` from the "variants_sudoku.go" file on the server.
 * See there for corresponding documentation on how the score is calculated. Additionally, since
 * here, we want to return the maximum score per stack (this is needed for endgame calculations,
 * since the distribution of playable cards to the stacks matters for how many clues we can get back
 * before the extra round starts), we will find an optimum solution (in terms of score) such that
 * the distribution of the played cards to the stacks is lexicographically minimal (after sorting
 * the values) as well, since this allows for the most amount of clues to be gotten back before the
 * extra-round.
 */
export declare function sudokuGetMaxScorePerStack(deck: readonly CardState[], playStackStarts: GameState["playStackStarts"], variant: Variant): Tuple<number, NumSuits>;
//# sourceMappingURL=sudoku.d.ts.map