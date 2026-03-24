"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cardDeductionReducer = cardDeductionReducer;
const complete_common_1 = require("complete-common");
const gameData_1 = require("../gameData");
const deck_1 = require("../rules/deck");
let cachedVariantID;
let cachedCardCountMap = [];
function cardDeductionReducer(deck, oldDeck, action, hands, metadata) {
    switch (action.type) {
        case "cardIdentity":
        case "clue":
        case "discard":
        case "play":
        case "draw": {
            return makeDeductions(deck, oldDeck, hands, metadata);
        }
        default: {
            return deck;
        }
    }
}
function makeDeductions(deck, oldDeck, hands, metadata) {
    const newDeck = [...deck];
    const variant = (0, gameData_1.getVariant)(metadata.options.variantName);
    const cardCountMap = getCardCountMap(variant);
    // We need to calculate our own unknown cards first because those possibilities will be needed for
    // pretending like we know what the other players see.
    updateAllCardPossibilities(metadata.ourPlayerIndex, metadata.ourPlayerIndex, hands, newDeck, oldDeck, cardCountMap, metadata);
    for (const playerIndex of (0, complete_common_1.tupleKeys)(hands)) {
        if (playerIndex !== metadata.ourPlayerIndex) {
            updateAllCardPossibilities(playerIndex, metadata.ourPlayerIndex, hands, newDeck, oldDeck, cardCountMap, metadata);
        }
    }
    return newDeck;
}
/** Mutates the deck in-place. */
function updateAllCardPossibilities(playerIndex, ourPlayerIndex, hands, 
// eslint-disable-next-line complete/prefer-readonly-parameter-types
deck, oldDeck, cardCountMap, metadata) {
    for (const hand of hands) {
        for (const order of hand) {
            const card = deck[order];
            if (card === undefined) {
                continue;
            }
            if (shouldUpdateCardPossibilities(card, playerIndex, ourPlayerIndex, deck, oldDeck)) {
                updateCardPossibilities(card, playerIndex, ourPlayerIndex, deck, cardCountMap, metadata);
            }
        }
    }
}
function shouldUpdateCardPossibilities(card, playerIndex, ourPlayerIndex, deck, oldDeck) {
    if (playerIndex !== ourPlayerIndex && playerIndex !== card.location) {
        // Both possibleCards and possibleCardsFromEmpathy are not calculated by the player at
        // playerIndex.
        return false;
    }
    if (card.revealedToPlayer[playerIndex] === true) {
        // The player already knows what this card is.
        return false;
    }
    const cardPossibilitiesForPlayer = getCardPossibilitiesForPlayer(card, playerIndex, ourPlayerIndex);
    if (cardPossibilitiesForPlayer.length === 1) {
        // The player already knows what this card is.
        return false;
    }
    const oldCard = oldDeck[card.order];
    if (oldCard === undefined || oldCard.location === "deck") {
        // This is a newly drawn card and hasn't had any calculations yet.
        return true;
    }
    // If the possibilities on the other cards in the deck do not change, then the result of our
    // calculation won't change. We only need to recalculate the card if the input (possibilities)
    // changed.
    return deckPossibilitiesDifferent(card.order, deck, oldDeck, playerIndex, ourPlayerIndex);
}
/** Mutates the deck in-place. */
function updateCardPossibilities(card, playerIndex, ourPlayerIndex, 
// eslint-disable-next-line complete/prefer-readonly-parameter-types
deck, cardCountMap, metadata) {
    const deckPossibilities = generateDeckPossibilities(card.order, deck, playerIndex, ourPlayerIndex, metadata);
    let { possibleCards, possibleCardsForEmpathy } = card;
    if (playerIndex === ourPlayerIndex) {
        possibleCards = filterCardPossibilities(card.possibleCards, deckPossibilities, cardCountMap);
    }
    if (playerIndex === card.location) {
        possibleCardsForEmpathy = filterCardPossibilities(card.possibleCardsForEmpathy, deckPossibilities, cardCountMap);
    }
    const newCard = {
        ...card,
        possibleCards,
        possibleCardsForEmpathy,
    };
    deck[card.order] = newCard; // eslint-disable-line no-param-reassign
}
function getCardPossibilitiesForPlayer(card, playerIndex, ourPlayerIndex) {
    if (card === undefined) {
        return [];
    }
    if (card.location === playerIndex) {
        // If this card is in the players hand, then use our best (empathy) guess.
        return card.possibleCardsForEmpathy;
    }
    const revealedToThisPlayer = card.revealedToPlayer[playerIndex] ?? false;
    if (revealedToThisPlayer && card.suitIndex !== null && card.rank !== null) {
        // If we know the suit and rank, it might be because it is morphed.
        return [[card.suitIndex, card.rank]];
    }
    if (playerIndex === ourPlayerIndex || revealedToThisPlayer) {
        // This is revealed to the player or we are the requested player => just use our best knowledge.
        return card.possibleCards;
    }
    // This is an unrevealed card outside of the players hand but not revealed to them. That can
    // happen with something like a detrimental character (such as Slow-Witted) or a variant (such as
    // Throw It in a Hole). We can't use our best (empathy) guess, because it might be in our own hand
    // and we might know more about the card then the other player does. We know the other player at
    // least knows about the clues for it, so we will use that set of possibilities.
    return card.possibleCardsFromClues;
}
function generateDeckPossibilities(excludeCardOrder, deck, playerIndex, ourPlayerIndex, metadata) {
    const deckPossibilities = [];
    for (const card of deck) {
        if (canBeUsedToDisprovePossibility(card, excludeCardOrder, playerIndex)) {
            const cardPossibilities = getCardPossibilitiesForPlayer(card, playerIndex, ourPlayerIndex);
            deckPossibilities.push(cardPossibilities);
        }
    }
    /**
     * Start with the more stable possibilities. This is for performance. It seemed to have a
     * measurable difference. The `possibilityValid` method will short-circuit if it finds a branch
     * that is impossible or if it finds a possibility that is valid. Here's an example:
     *
     * ```ts
     * deckPossibilities = [
     *   [red 5 or yellow 5],
     *   [green or blue],
     *   [green or blue],
     *   [green or blue],
     *   [red 5],
     * ]
     * ```
     *
     * `possibilityValid` would initially start with the first card being red 5. It would then check
     * about 1000 combinations of the next three cards before finding each one is impossible at the
     * very end of each combination. If we reorder that to:
     *
     * ```ts
     * deckPossibilities=[
     *   [red 5],
     *   [red 5 or yellow 5],
     *   [green or blue],
     *   [green or blue],
     *   [green or blue],
     * ]
     * ```
     *
     * Then when it attempts to resolve [red 5 or yellow 5] to red 5, it will realize that's
     * impossible and short-circuit that branch (not checking the next 1000 combinations of the next 3
     * cards). It would switch to checking if the combination would work when [red 5 or yellow 5]
     * resolves to yellow 5 (by finding a combination of the next 3 cards that fit). So it should get
     * to a fitting combination quicker or find that there is no fitting combination quicker. This
     * applies to more than just cards that have one possibility (such as red 5 in the example).
     */
    deckPossibilities.sort((a, b) => a.length - b.length);
    const variant = (0, gameData_1.getVariant)(metadata.options.variantName);
    const cardCountMap = getCardCountMap(variant);
    return deckPossibilities.filter((a) => isPossibleCard(a, cardCountMap));
}
/**
 * When we are in a hypo and morph cards, we can create impossible decks. If we do, the empathy will
 * be broken. Remove cards from possibilities that we know are from an impossible deck.
 *
 * Mutates the `cardCountMap` in-place.
 */
function isPossibleCard(possibilities, cardCountMap) {
    // We know the card.
    if (possibilities.length === 1) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const [suitIndex, rank] = possibilities[0];
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, no-param-reassign
        cardCountMap[suitIndex][rank]--;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        if (cardCountMap[suitIndex][rank] < 0) {
            return false;
        }
    }
    return true;
}
function canBeUsedToDisprovePossibility(card, excludeCardOrder, playerIndex) {
    return (card !== undefined
        && card.order !== excludeCardOrder
        // It's revealed to the player / we know more than nothing about it, so it could be useful
        // disproving a possibility in the players hand.
        && (card.revealedToPlayer[playerIndex] === true || card.hasClueApplied));
}
function deckPossibilitiesDifferent(excludeCardOrder, deck, oldDeck, playerIndex, ourPlayerIndex) {
    for (const [order, card] of deck.entries()) {
        const oldCard = oldDeck[order];
        const previouslyUsed = canBeUsedToDisprovePossibility(oldCard, excludeCardOrder, playerIndex);
        const currentlyUsed = canBeUsedToDisprovePossibility(card, excludeCardOrder, playerIndex);
        if (previouslyUsed !== currentlyUsed) {
            return true;
        }
        if (currentlyUsed) {
            const previousPossibilities = getCardPossibilitiesForPlayer(oldCard, playerIndex, ourPlayerIndex);
            const currentPossibilities = getCardPossibilitiesForPlayer(card, playerIndex, ourPlayerIndex);
            if (previousPossibilities.length !== currentPossibilities.length) {
                return true;
            }
        }
    }
    // We are dealing with the same number of unknown cards, and each unknown card has the same number
    // of possibilities it had previously. Once a card joins the set of "unknown" cards then it will
    // always remain in that set, even if it has only one possibility. So if we have the same number
    // of unknown cards, then they will be the same set of unknown cards. Similar logic can be applied
    // to the possibilities for each unknown card. The new possible values for an unknown card can
    // only be a subset of the possible values. In other words, if an unknown card could not
    // previously be a red 5, then it won't suddenly regain the ability to be a red 5 in a later turn.
    // Therefore, if the count of possible suit/rank combinations remains the same, then the
    // underlying suit/rank combinations should also be the same.
    return false;
}
function filterCardPossibilities(cardPossibilities, deckPossibilities, cardCountMap) {
    /**
     * Tracks what possibilities have yet to be validated for a specific card from a specific
     * perspective. When a specific possibility/identity for that card is validated in the
     * `possibilityValid` function (by finding a working combination of card identities), it will
     * check if it is possible to swap the identity for our specific card and still have a working
     * combination. If so, then the new identity for our specific card is also valid and does not need
     * to be validated again (so it is removed from the array).
     */
    const possibilitiesToValidate = [...cardPossibilities];
    return cardPossibilities.filter((possibility) => {
        // If the possibility is not in the list that still needs validation then it must mean the
        // possibility is already validated and we can exit early.
        if (!hasPossibility(possibilitiesToValidate, possibility)) {
            return true;
        }
        return possibilityValid(possibility, deckPossibilities, 0, cardCountMap, possibilitiesToValidate);
    });
}
function hasPossibility(possibilitiesToValidate, [suitIndex, rank]) {
    return possibilitiesToValidate.some(([suitIndexCandidate, rankCandidate]) => suitIndexCandidate === suitIndex && rankCandidate === rank);
}
/** Mutates the `countCountMap` and `possibilitiesToValidate` in-place. */
function possibilityValid([suitIndex, rank], deckPossibilities, index, cardCountMap, 
// eslint-disable-next-line complete/prefer-readonly-parameter-types
possibilitiesToValidate) {
    if (deckPossibilities.length === index) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        if (cardCountMap[suitIndex][rank] > 0) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, no-param-reassign
            cardCountMap[suitIndex][rank]--;
            updatePossibilitiesToValidate(cardCountMap, possibilitiesToValidate);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, no-param-reassign
            cardCountMap[suitIndex][rank]++;
            return true;
        }
        return false;
    }
    // Avoiding duplicating the map for performance, so trying to undo the mutation as we exit.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, no-param-reassign
    cardCountMap[suitIndex][rank]--;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (cardCountMap[suitIndex][rank] >= 0) {
        const suitRankTuples = deckPossibilities[index];
        (0, complete_common_1.assertDefined)(suitRankTuples, `Failed to find the the deck possibility at index: ${index}`);
        for (const i of suitRankTuples.keys()) {
            const possibilityIndex = (i + index) % suitRankTuples.length;
            const possibility = suitRankTuples[possibilityIndex];
            if (possibility === undefined) {
                continue;
            }
            if (possibilityValid(possibility, deckPossibilities, index + 1, cardCountMap, possibilitiesToValidate)) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, no-param-reassign
                cardCountMap[suitIndex][rank]++;
                return true;
            }
        }
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, no-param-reassign
    cardCountMap[suitIndex][rank]++;
    return false;
}
/** Mutates the `possibilitiesToValidate` in-place. */
function updatePossibilitiesToValidate(cardCountMap, 
// eslint-disable-next-line complete/prefer-readonly-parameter-types
possibilitiesToValidate) {
    let j = 0;
    for (const suitRankTuple of possibilitiesToValidate) {
        const [suitIndex, rank] = suitRankTuple;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        if (cardCountMap[suitIndex][rank] <= 0) {
            // eslint-disable-next-line no-param-reassign
            possibilitiesToValidate[j] = [suitIndex, rank];
            j++;
        }
    }
    // eslint-disable-next-line no-param-reassign
    possibilitiesToValidate.length = j;
}
/** @returns A two-dimensional array which is indexed by suit index, then rank. */
function getCardCountMap(variant) {
    if (variant.id === cachedVariantID) {
        return (0, complete_common_1.arrayCopyTwoDimensional)(cachedCardCountMap);
    }
    const possibleCardMap = [];
    for (const [suitIndex, suit] of variant.suits.entries()) {
        possibleCardMap[suitIndex] = [];
        for (const rank of variant.ranks) {
            const numCopiesOfCard = (0, deck_1.getNumCopiesOfCard)(suit, rank, variant);
            possibleCardMap[suitIndex][rank] = numCopiesOfCard;
        }
    }
    cachedVariantID = variant.id;
    cachedCardCountMap = (0, complete_common_1.arrayCopyTwoDimensional)(possibleCardMap);
    return possibleCardMap;
}
//# sourceMappingURL=cardDeductionReducer.js.map