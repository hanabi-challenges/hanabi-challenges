"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.knownTrashReducer = knownTrashReducer;
const card_1 = require("../rules/card");
function knownTrashReducer(deck, playStacks, playStackDirections, playStackStarts, variant) {
    const newDeck = [...deck];
    for (const [order, card] of newDeck.entries()) {
        const isKnownTrashFromEmpathy = (0, card_1.isAllCardPossibilitiesTrash)(card, deck, playStacks, playStackDirections, playStackStarts, variant, true);
        newDeck[order] = {
            ...card,
            isKnownTrashFromEmpathy,
        };
    }
    return newDeck;
}
//# sourceMappingURL=knownTrashReducer.js.map