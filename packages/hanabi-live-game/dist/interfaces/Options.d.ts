import { z } from "zod";
/**
 * We use a Zod object instead of a class because this is sent over the wire and Zod cannot validate
 * class shapes.
 */
export declare const options: z.ZodReadonly<z.ZodObject<{
    numPlayers: z.ZodDefault<z.ZodCustom<3 | 2 | 4 | 5 | 6, 3 | 2 | 4 | 5 | 6>>;
    startingPlayer: z.ZodDefault<z.ZodCustom<import("../types/PlayerIndex").PlayerIndex, import("../types/PlayerIndex").PlayerIndex>>;
    variantName: z.ZodDefault<z.ZodString>;
    timed: z.ZodDefault<z.ZodBoolean>;
    timeBase: z.ZodDefault<z.ZodNumber>;
    timePerTurn: z.ZodDefault<z.ZodNumber>;
    speedrun: z.ZodDefault<z.ZodBoolean>;
    cardCycle: z.ZodDefault<z.ZodBoolean>;
    deckPlays: z.ZodDefault<z.ZodBoolean>;
    emptyClues: z.ZodDefault<z.ZodBoolean>;
    oneExtraCard: z.ZodDefault<z.ZodBoolean>;
    oneLessCard: z.ZodDefault<z.ZodBoolean>;
    allOrNothing: z.ZodDefault<z.ZodBoolean>;
    detrimentalCharacters: z.ZodDefault<z.ZodBoolean>;
    tableName: z.ZodOptional<z.ZodString>;
    maxPlayers: z.ZodOptional<z.ZodCustom<3 | 2 | 4 | 5 | 6, 3 | 2 | 4 | 5 | 6>>;
}, z.core.$strict>>;
export interface Options extends z.infer<typeof options> {
}
export declare const defaultOptions: Options;
//# sourceMappingURL=Options.d.ts.map