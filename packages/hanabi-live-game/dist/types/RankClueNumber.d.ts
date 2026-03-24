import { z } from "zod";
import { DEFAULT_CLUE_RANKS } from "../constants";
export declare const rankClueNumber: z.ZodCustom<3 | 1 | 2 | 4 | 5, 3 | 1 | 2 | 4 | 5>;
/** The normal ranks of 1 through 5, representing the valid values for rank clues. */
export type RankClueNumber = (typeof DEFAULT_CLUE_RANKS)[number];
export declare function isValidRankClueNumber(value: unknown): value is RankClueNumber;
//# sourceMappingURL=RankClueNumber.d.ts.map