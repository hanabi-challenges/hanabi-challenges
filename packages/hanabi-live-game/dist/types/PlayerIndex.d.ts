import type { ERange } from "complete-common";
import { z } from "zod";
import type { MAX_PLAYERS } from "../constants";
export declare const playerIndex: z.ZodCustom<PlayerIndex, PlayerIndex>;
/** The maximum number of players in a game is 6. Thus, the valid player indexes are 0 through 5. */
export type PlayerIndex = ERange<0, typeof MAX_PLAYERS>;
export declare function isValidPlayerIndex(value: unknown): value is PlayerIndex;
//# sourceMappingURL=PlayerIndex.d.ts.map