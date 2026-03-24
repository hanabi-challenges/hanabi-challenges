"use strict";
// Miscellaneous helpers used by several reducers.
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCharacterNameForPlayer = getCharacterNameForPlayer;
exports.getEfficiencyFromGameState = getEfficiencyFromGameState;
const complete_common_1 = require("complete-common");
const gameData_1 = require("../gameData");
const stats_1 = require("../rules/stats");
function getCharacterNameForPlayer(playerIndex, characterAssignments) {
    const characterID = getCharacterIDForPlayer(playerIndex, characterAssignments);
    return characterID === null ? "" : (0, gameData_1.getCharacter)(characterID).name;
}
function getCharacterIDForPlayer(playerIndex, characterAssignments) {
    if (playerIndex === null) {
        return null; // eslint-disable-line unicorn/no-null
    }
    const characterID = characterAssignments[playerIndex];
    (0, complete_common_1.assertDefined)(characterID, `The character ID for player ${playerIndex} was undefined.`);
    return characterID;
}
function getEfficiencyFromGameState(gameState) {
    return (0, stats_1.getEfficiency)(gameState.stats.cardsGotten, gameState.stats.potentialCluesLost);
}
//# sourceMappingURL=reducerHelpers.js.map