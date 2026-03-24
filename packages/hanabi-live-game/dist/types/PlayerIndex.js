"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.playerIndex = void 0;
exports.isValidPlayerIndex = isValidPlayerIndex;
const zod_1 = require("zod");
const constants_1 = require("../constants");
exports.playerIndex = zod_1.z.custom(isValidPlayerIndex);
function isValidPlayerIndex(value) {
    return constants_1.VALID_PLAYER_INDEXES.includes(value);
}
//# sourceMappingURL=PlayerIndex.js.map