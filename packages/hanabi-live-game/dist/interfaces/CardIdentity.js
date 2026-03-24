"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cardIdentity = void 0;
const zod_1 = require("zod");
const Rank_1 = require("../types/Rank");
const SuitIndex_1 = require("../types/SuitIndex");
exports.cardIdentity = zod_1.z
    .object({
    /** `null` represents an unknown suit index. */
    suitIndex: SuitIndex_1.suitIndex.or(zod_1.z.null()),
    /** `null` represents an unknown rank. */
    rank: Rank_1.rank.or(zod_1.z.null()),
})
    .strict()
    .readonly();
//# sourceMappingURL=CardIdentity.js.map