"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.numPlayers = void 0;
exports.isValidNumPlayers = isValidNumPlayers;
const zod_1 = require("zod");
const constants_1 = require("../constants");
exports.numPlayers = zod_1.z.custom(isValidNumPlayers);
function isValidNumPlayers(value) {
    return constants_1.VALID_NUM_PLAYERS.includes(value);
}
//# sourceMappingURL=NumPlayers.js.map