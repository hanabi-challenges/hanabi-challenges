"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rankClueNumber = void 0;
exports.isValidRankClueNumber = isValidRankClueNumber;
const zod_1 = require("zod");
const constants_1 = require("../constants");
exports.rankClueNumber = zod_1.z.custom(isValidRankClueNumber);
function isValidRankClueNumber(value) {
    return constants_1.DEFAULT_CLUE_RANKS.includes(value);
}
//# sourceMappingURL=RankClueNumber.js.map