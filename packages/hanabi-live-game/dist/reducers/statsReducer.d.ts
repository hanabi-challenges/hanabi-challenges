import type { CardNote } from "../interfaces/CardNote";
import type { GameMetadata } from "../interfaces/GameMetadata";
import type { GameState } from "../interfaces/GameState";
import type { StatsState } from "../interfaces/StatsState";
import type { GameAction } from "../types/gameActions";
export declare const statsReducer: (state?: StatsState | undefined, action: GameAction, previousGameState: GameState, gameState: GameState, playing: boolean, shadowing: boolean, metadata: GameMetadata, ourNotes: readonly CardNote[] | null) => StatsState;
//# sourceMappingURL=statsReducer.d.ts.map