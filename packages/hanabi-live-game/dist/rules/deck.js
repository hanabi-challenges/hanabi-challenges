"use strict";
// Functions related to deck information: total cards, drawing cards
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTotalCardsInDeck = getTotalCardsInDeck;
exports.getNumCopiesOfCard = getNumCopiesOfCard;
exports.getNumDiscardedCopiesOfCard = getNumDiscardedCopiesOfCard;
exports.isInitialDealFinished = isInitialDealFinished;
exports.getDiscardHelpers = getDiscardHelpers;
exports.getAllDiscardedSetForSuit = getAllDiscardedSetForSuit;
const complete_common_1 = require("complete-common");
const constants_1 = require("../constants");
const gameData_1 = require("../gameData");
const cardState_1 = require("./cardState");
const hand_1 = require("./hand");
function getTotalCardsInDeck(variant) {
    const suitCounts = variant.suits.map((suit) => getTotalCardsInSuit(variant, suit));
    return (0, complete_common_1.sumArray)(suitCounts);
}
function getTotalCardsInSuit(variant, suit) {
    if (suit.oneOfEach) {
        if (variant.upOrDown) {
            // A critical suit in up or down has all unique cards plus an extra start card.
            return variant.stackSize + 1;
        }
        return variant.stackSize;
    }
    if (variant.upOrDown || variant.criticalRank !== undefined) {
        // The normal amount minus one because there is one more critical card.
        return variant.stackSize * 2 - 1;
    }
    // The normal amount: three 1's + two 2's + two 3's + two 4's + one 5
    return variant.stackSize * 2;
}
/**
 * Returns how many copies of this card should exist in the deck.
 *
 * This implementation mirrors `numCopiesOfCard` in "server/src/game_deck.go".
 */
function getNumCopiesOfCard(suit, rank, variant) {
    if (suit.oneOfEach) {
        return 1;
    }
    if (variant.criticalRank === rank) {
        return 1;
    }
    // Sudoku always has 2 cards.
    if (variant.sudoku) {
        return 2;
    }
    switch (rank) {
        case 1: {
            if (variant.upOrDown || suit.reversed) {
                return 1;
            }
            return 3;
        }
        case 2: {
            return 2;
        }
        case 3: {
            return 2;
        }
        case 4: {
            return 2;
        }
        case 5: {
            if (suit.reversed) {
                return 3;
            }
            return 1;
        }
        case constants_1.START_CARD_RANK: {
            if (variant.upOrDown) {
                return 1;
            }
            throw new Error("Attempted to add a START card to a variant that is not Up or Down.");
        }
    }
}
/** Returns how many cards of a specific suit/rank that have been already discarded. */
function getNumDiscardedCopiesOfCard(deck, suitIndex, rank) {
    let numDiscardedCopiesOfCard = 0;
    for (const cardState of deck) {
        if (cardState.suitIndex === suitIndex
            && cardState.rank === rank
            && (0, cardState_1.isCardDiscarded)(cardState)) {
            numDiscardedCopiesOfCard++;
        }
    }
    return numDiscardedCopiesOfCard;
}
function isInitialDealFinished(currentDeckSize, metadata) {
    const variant = (0, gameData_1.getVariant)(metadata.options.variantName);
    const totalCardsInDeck = getTotalCardsInDeck(variant);
    const numCardsPerHand = (0, hand_1.getCardsPerHand)(metadata.options);
    return (currentDeckSize
        === totalCardsInDeck - metadata.options.numPlayers * numCardsPerHand);
}
function getDiscardHelpers(variant, deck) {
    // eslint-disable-next-line func-style
    const total = (suitIndex, rank) => {
        const suit = variant.suits[suitIndex];
        if (suit === undefined) {
            return 0;
        }
        return getNumCopiesOfCard(suit, rank, variant);
    };
    // eslint-disable-next-line func-style
    const discarded = (suitIndex, rank) => getNumDiscardedCopiesOfCard(deck, suitIndex, rank);
    // eslint-disable-next-line func-style
    const isLastCopy = (suitIndex, rank) => total(suitIndex, rank) === discarded(suitIndex, rank) + 1;
    // eslint-disable-next-line func-style
    const isAllDiscarded = (suitIndex, rank) => total(suitIndex, rank) === discarded(suitIndex, rank);
    return { isLastCopy, isAllDiscarded };
}
function getAllDiscardedSetForSuit(variant, deck, suitIndex) {
    const { isAllDiscarded } = getDiscardHelpers(variant, deck);
    const allDiscardedSet = new Set();
    for (const variantRank of variant.ranks) {
        if (isAllDiscarded(suitIndex, variantRank)) {
            allDiscardedSet.add(variantRank);
        }
    }
    return allDiscardedSet;
}
//# sourceMappingURL=deck.js.map