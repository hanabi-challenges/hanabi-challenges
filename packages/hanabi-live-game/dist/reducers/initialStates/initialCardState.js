"use strict";
/* eslint-disable unicorn/no-null */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInitialCardState = getInitialCardState;
const complete_common_1 = require("complete-common");
const deck_1 = require("../../rules/deck");
function getInitialCardState(order, variant, numPlayers) {
    // Possible suits and ranks (based on clues given) are tracked separately from knowledge of the
    // true suit and rank.
    const possibleCards = [];
    for (const i of variant.suits.keys()) {
        const suitIndex = i;
        for (const rank of variant.ranks) {
            possibleCards.push([suitIndex, rank]);
        }
    }
    const totalCardsInDeck = (0, deck_1.getTotalCardsInDeck)(variant);
    return {
        order,
        location: order < totalCardsInDeck ? "deck" : "playStack",
        suitIndex: null,
        rank: null,
        possibleCardsFromClues: possibleCards,
        possibleCards,
        possibleCardsForEmpathy: possibleCards,
        revealedToPlayer: (0, complete_common_1.newArray)(numPlayers, false),
        positiveColorClues: [],
        positiveRankClues: [],
        suitDetermined: false,
        rankDetermined: false,
        hasClueApplied: false,
        numPositiveClues: 0,
        segmentDrawn: null,
        segmentFirstClued: null,
        segmentPlayed: null,
        segmentDiscarded: null,
        isMisplayed: false,
        dealtToStartingHand: false,
        firstCluedWhileOnChop: null,
        inDoubleDiscard: false,
        isKnownTrashFromEmpathy: false,
    };
}
//# sourceMappingURL=initialCardState.js.map