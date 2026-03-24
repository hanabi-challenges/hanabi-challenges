import type { GameMetadata } from "./interfaces/GameMetadata";
import type { NumPlayers } from "./types/NumPlayers";
/**
 * This function is not used by the client, because the corresponding metadata for a game will
 * always come from the server.
 *
 * Thus, this function is useful for tests and bots.
 */
export declare function getDefaultMetadata(numPlayers: NumPlayers, variantName?: string): GameMetadata;
//# sourceMappingURL=metadata.d.ts.map