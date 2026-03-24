import { z } from "zod";
import type { DEFAULT_CARD_RANKS } from "../constants";
import { ALL_CARD_RANKS } from "../constants";
/** The normal ranks of 1 through 5 (corresponding to the `DEFAULT_CARD_RANKS` constant). */
export type BasicRank = (typeof DEFAULT_CARD_RANKS)[number];
export declare const rank: z.ZodCustom<7 | 3 | 1 | 2 | 4 | 5, 7 | 3 | 1 | 2 | 4 | 5>;
/**
 * The normal ranks of 1 through 5 (corresponding to the `DEFAULT_CARD_RANKS` constant) and the rank
 * of `START_CARD_RANK`.
 */
export type Rank = (typeof ALL_CARD_RANKS)[number];
//# sourceMappingURL=Rank.d.ts.map