"use strict";
// Functions related to hand management.
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCardsPerHand = getCardsPerHand;
exports.getCardSlot = getCardSlot;
exports.isHandLocked = isHandLocked;
exports.getChopIndex = getChopIndex;
exports.isCardOnChop = isCardOnChop;
const cardState_1 = require("./cardState");
function getCardsPerHand(options) {
    return (getCardsPerHandNatural(options.numPlayers)
        + (options.oneExtraCard ? 1 : 0)
        - (options.oneLessCard ? 1 : 0));
}
function getCardsPerHandNatural(numPlayers) {
    switch (numPlayers) {
        case 2:
        case 3: {
            return 5;
        }
        case 4:
        case 5: {
            return 4;
        }
        case 6: {
            return 3;
        }
    }
}
/** For example, slot 1 is the newest (left-most) card, which is at index 4 (in a 3-player game). */
function getCardSlot(order, hand) {
    const index = hand.indexOf(order);
    return index === -1 ? undefined : hand.length - index;
}
function isHandLocked(hand, deck) {
    return hand.every((order) => {
        const cardState = deck[order];
        return cardState !== undefined && (0, cardState_1.isCardClued)(cardState);
    });
}
function getChopIndex(hand, deck) {
    // The chop is defined as the oldest (right-most) unclued card.
    for (const [i, cardOrder] of hand.entries()) {
        const cardState = deck[cardOrder];
        if (cardState && !(0, cardState_1.isCardClued)(cardState)) {
            return i;
        }
    }
    // Their hand is filled with clued cards, so the chop is considered to be their newest (left-most)
    // card.
    return hand.length - 1;
}
function isCardOnChop(hand, deck, card) {
    const cardIndexInHand = hand.indexOf(card.order);
    const handChopIndex = getChopIndex(hand, deck);
    return cardIndexInHand === handChopIndex;
}
//# sourceMappingURL=hand.js.map