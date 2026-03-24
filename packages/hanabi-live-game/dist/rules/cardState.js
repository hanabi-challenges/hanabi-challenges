"use strict";
// Functions relating to the `CardState` interface.
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCardClued = isCardClued;
exports.isCardPlayed = isCardPlayed;
exports.isCardDiscarded = isCardDiscarded;
exports.isCardInPlayerHand = isCardInPlayerHand;
function isCardClued(cardState) {
    return cardState.numPositiveClues > 0;
}
function isCardPlayed(cardState) {
    return cardState.location === "playStack";
}
function isCardDiscarded(cardState) {
    return cardState.location === "discard";
}
function isCardInPlayerHand(cardState) {
    return typeof cardState.location === "number";
}
//# sourceMappingURL=cardState.js.map