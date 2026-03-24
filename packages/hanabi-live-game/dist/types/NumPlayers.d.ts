import { z } from "zod";
import { VALID_NUM_PLAYERS } from "../constants";
export declare const numPlayers: z.ZodCustom<3 | 2 | 4 | 5 | 6, 3 | 2 | 4 | 5 | 6>;
export type NumPlayers = (typeof VALID_NUM_PLAYERS)[number];
export declare function isValidNumPlayers(value: unknown): value is NumPlayers;
//# sourceMappingURL=NumPlayers.d.ts.map