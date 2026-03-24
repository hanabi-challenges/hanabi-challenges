import type { GameMetadata } from "../interfaces/GameMetadata";
import type { Options } from "../interfaces/Options";
import type { Variant } from "../interfaces/Variant";
import type { NumPlayers } from "../types/NumPlayers";
import type { PlayerIndex } from "../types/PlayerIndex";
export declare function shouldEndTurnAfterDraw(cardsPlayedOrDiscardedThisTurn: number, cardsDiscardedThisTurn: number, characterName: string, clueTokens: number, variant: Variant): boolean;
export declare function shouldEndTurnAfterClue(cluesGivenThisTurn: number, characterName: string): boolean;
export declare function shouldPlayOrderInvert(characterName: string): boolean;
export declare function getNextPlayerIndex(currentPlayerIndex: PlayerIndex | null, numPlayers: NumPlayers, turnsInverted: boolean): PlayerIndex | null;
export declare function getEndGameLength(options: Options, characterAssignments: Readonly<Array<number | null>>): number;
export declare function getEndTurn(turn: number, metadata: GameMetadata): number;
//# sourceMappingURL=turn.d.ts.map