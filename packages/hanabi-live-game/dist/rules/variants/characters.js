"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldSeeSlot2CardIdentity = shouldSeeSlot2CardIdentity;
const reducerHelpers_1 = require("../../reducers/reducerHelpers");
/**
 * In games with "Detrimental Characters", not all players may necessarily see the cards of other
 * players.
 */
function shouldSeeSlot2CardIdentity(metadata) {
    if (!metadata.options.detrimentalCharacters) {
        return false;
    }
    const characterName = (0, reducerHelpers_1.getCharacterNameForPlayer)(metadata.ourPlayerIndex, metadata.characterAssignments);
    return characterName === "Slow-Witted";
}
//# sourceMappingURL=characters.js.map