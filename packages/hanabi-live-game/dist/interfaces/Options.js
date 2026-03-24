"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultOptions = exports.options = void 0;
const zod_1 = require("zod");
const constants_1 = require("../constants");
const NumPlayers_1 = require("../types/NumPlayers");
const PlayerIndex_1 = require("../types/PlayerIndex");
/**
 * We use a Zod object instead of a class because this is sent over the wire and Zod cannot validate
 * class shapes.
 */
exports.options = zod_1.z
    .object({
    numPlayers: NumPlayers_1.numPlayers.default(2),
    /** Legacy field for games prior to April 2020. */
    startingPlayer: PlayerIndex_1.playerIndex.default(0),
    variantName: zod_1.z.string().min(1).default(constants_1.DEFAULT_VARIANT_NAME),
    timed: zod_1.z.boolean().default(false),
    timeBase: zod_1.z.number().default(0),
    timePerTurn: zod_1.z.number().int().default(0),
    speedrun: zod_1.z.boolean().default(false),
    cardCycle: zod_1.z.boolean().default(false),
    deckPlays: zod_1.z.boolean().default(false),
    emptyClues: zod_1.z.boolean().default(false),
    oneExtraCard: zod_1.z.boolean().default(false),
    oneLessCard: zod_1.z.boolean().default(false),
    allOrNothing: zod_1.z.boolean().default(false),
    detrimentalCharacters: zod_1.z.boolean().default(false),
    tableName: zod_1.z.string().min(1).optional(),
    maxPlayers: NumPlayers_1.numPlayers.optional(),
})
    .strict()
    .readonly();
exports.defaultOptions = exports.options.parse({});
//# sourceMappingURL=Options.js.map