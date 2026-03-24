import { z } from "zod";
import { VALID_SUIT_INDEXES } from "../constants";
export declare const suitIndex: z.ZodCustom<0 | 3 | 1 | 2 | 4 | 5, 0 | 3 | 1 | 2 | 4 | 5>;
export type SuitIndex = (typeof VALID_SUIT_INDEXES)[number];
//# sourceMappingURL=SuitIndex.d.ts.map