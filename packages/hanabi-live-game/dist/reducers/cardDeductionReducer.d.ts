import type { CardState } from "../interfaces/CardState";
import type { GameMetadata } from "../interfaces/GameMetadata";
import type { GameState } from "../interfaces/GameState";
import type { GameAction } from "../types/gameActions";
export declare function cardDeductionReducer(deck: readonly CardState[], oldDeck: readonly CardState[], action: GameAction, hands: GameState["hands"], metadata: GameMetadata): readonly CardState[];
//# sourceMappingURL=cardDeductionReducer.d.ts.map