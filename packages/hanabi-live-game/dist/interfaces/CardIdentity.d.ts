import { z } from "zod";
export declare const cardIdentity: z.ZodReadonly<z.ZodObject<{
    suitIndex: z.ZodUnion<[z.ZodCustom<0 | 3 | 1 | 2 | 4 | 5, 0 | 3 | 1 | 2 | 4 | 5>, z.ZodNull]>;
    rank: z.ZodUnion<[z.ZodCustom<7 | 3 | 1 | 2 | 4 | 5, 7 | 3 | 1 | 2 | 4 | 5>, z.ZodNull]>;
}, z.core.$strict>>;
export interface CardIdentity extends z.infer<typeof cardIdentity> {
}
//# sourceMappingURL=CardIdentity.d.ts.map