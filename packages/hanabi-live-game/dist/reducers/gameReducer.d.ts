import type { CardNote } from "../interfaces/CardNote";
import type { GameMetadata } from "../interfaces/GameMetadata";
import type { GameState } from "../interfaces/GameState";
import type { GameAction } from "../types/gameActions";
/** Computes the next game state from a given action. */
export declare const gameReducer: (state?: GameState | undefined, action: GameAction, playing: boolean, shadowing: boolean, finished: boolean, hypothetical: boolean, metadata: GameMetadata, ourNotes?: readonly CardNote[] | undefined) => GameState;
//# sourceMappingURL=gameReducer.d.ts.map