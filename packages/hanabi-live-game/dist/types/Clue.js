"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.newColorClue = newColorClue;
exports.newRankClue = newRankClue;
const ClueType_1 = require("../enums/ClueType");
function newColorClue(color) {
    return {
        type: ClueType_1.ClueType.Color,
        value: color,
    };
}
function newRankClue(rank) {
    return {
        type: ClueType_1.ClueType.Rank,
        value: rank,
    };
}
//# sourceMappingURL=Clue.js.map