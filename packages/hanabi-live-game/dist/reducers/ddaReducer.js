"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ddaReducer = ddaReducer;
const complete_common_1 = require("complete-common");
const card_1 = require("../rules/card");
function ddaReducer(deck, dda, currentPlayerIndex) {
    const newDeck = [...deck];
    if (dda === null || currentPlayerIndex === null) {
        for (const [order, card] of newDeck.entries()) {
            newDeck[order] = {
                ...card,
                inDoubleDiscard: false,
            };
        }
        return newDeck;
    }
    const ddaCard = deck[dda];
    (0, complete_common_1.assertDefined)(ddaCard, `Failed to find the card at order: ${dda}`);
    const { suitIndex, rank } = ddaCard;
    for (const [order, card] of newDeck.entries()) {
        const inDoubleDiscard = card.location === currentPlayerIndex
            && (0, card_1.canCardPossiblyBeFromCluesOnly)(card, suitIndex, rank);
        newDeck[order] = {
            ...card,
            inDoubleDiscard,
        };
    }
    return newDeck;
}
//# sourceMappingURL=ddaReducer.js.map