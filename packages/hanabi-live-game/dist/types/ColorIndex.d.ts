import { z } from "zod";
import { VALID_CLUE_COLOR_INDEXES } from "../constants";
export declare const colorIndex: z.ZodCustom<0 | 3 | 1 | 2 | 4 | 5, 0 | 3 | 1 | 2 | 4 | 5>;
export type ColorIndex = (typeof VALID_CLUE_COLOR_INDEXES)[number];
//# sourceMappingURL=ColorIndex.d.ts.map