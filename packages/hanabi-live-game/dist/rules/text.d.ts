import type { Tuple } from "complete-common";
import { EndCondition } from "../enums/EndCondition";
import type { GameMetadata } from "../interfaces/GameMetadata";
import type { NumPlayers } from "../types/NumPlayers";
import type { PlayerIndex } from "../types/PlayerIndex";
import type { ActionClue, ActionDiscard, ActionPlay } from "../types/gameActions";
export declare function getGoesFirstText(playerIndex: PlayerIndex | null, playerNames: Readonly<Tuple<string, NumPlayers>>): string;
export declare function getClueText(action: ActionClue, targetHand: readonly number[], hypothetical: boolean, metadata: GameMetadata): string;
export declare function getGameOverText(endCondition: EndCondition, playerIndex: PlayerIndex, score: number, metadata: GameMetadata, votes: readonly PlayerIndex[] | null): string;
export declare function getPlayText(action: ActionPlay | ActionDiscard, slot: number | null, touched: boolean, playing: boolean, shadowing: boolean, hypothetical: boolean, metadata: GameMetadata): string;
export declare function getDiscardText(action: ActionDiscard, slot: number | null, touched: boolean, critical: boolean, playing: boolean, shadowing: boolean, hypothetical: boolean, metadata: GameMetadata): string;
export declare function getPlayerName(playerIndex: PlayerIndex, metadata: GameMetadata): string;
export declare function millisecondsToClockString(milliseconds: number): string;
//# sourceMappingURL=text.d.ts.map