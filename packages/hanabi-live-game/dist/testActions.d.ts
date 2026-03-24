import type { ColorIndex } from "./types/ColorIndex";
import type { PlayerIndex } from "./types/PlayerIndex";
import type { Rank } from "./types/Rank";
import type { RankClueNumber } from "./types/RankClueNumber";
import type { SuitIndex } from "./types/SuitIndex";
import type { ActionCardIdentity, ActionClue, ActionDiscard, ActionDraw, ActionPlay, ActionStrike } from "./types/gameActions";
/** Helper functions to build a color `ActionClue` with a compact syntax. For use in tests. */
export declare function colorClue(value: ColorIndex, giver: PlayerIndex, list: readonly number[], // We do not want to force the consumer to brand their numbers.
target: PlayerIndex): ActionClue;
/** Helper functions to build a rank `ActionClue` with a compact syntax. For use in tests. */
export declare function rankClue(value: RankClueNumber, giver: PlayerIndex, list: readonly number[], // We do not want to force the consumer to brand their numbers.
target: PlayerIndex): ActionClue;
/** Helper functions to build a `ActionDraw` with a compact syntax. For use in tests. */
export declare function draw(playerIndex: PlayerIndex, order: number, // We do not want to force the consumer to brand their numbers.
suitIndex?: SuitIndex | -1, rank?: Rank | -1): ActionDraw;
/** Helper functions to build a `ActionDiscard` with a compact syntax. For use in tests. */
export declare function discard(playerIndex: PlayerIndex, order: number, // We do not want to force the consumer to brand their numbers.
suitIndex: SuitIndex | -1, rank: Rank | -1, failed: boolean): ActionDiscard;
/** Helper functions to build a `ActionPlay` with a compact syntax. For use in tests. */
export declare function play(playerIndex: PlayerIndex, order: number, // We do not want to force the consumer to brand their numbers.
suitIndex: SuitIndex, rank: Rank): ActionPlay;
/** Helper functions to build a `ActionCardIdentity` with a compact syntax. For use in tests. */
export declare function actionCardIdentity(playerIndex: PlayerIndex, order: number, // We do not want to force the consumer to brand their numbers.
suitIndex: SuitIndex, rank: Rank): ActionCardIdentity;
/** Helper functions to build a `ActionStrike` with a compact syntax. For use in tests. */
export declare function strike(num: 1 | 2 | 3, order: number, // We do not want to force the consumer to brand their numbers.
turn: number): ActionStrike;
//# sourceMappingURL=testActions.d.ts.map