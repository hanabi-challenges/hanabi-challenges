"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCardName = getCardName;
exports.isCardNeededForMaxScore = isCardNeededForMaxScore;
exports.getCardStatus = getCardStatus;
exports.isCardCritical = isCardCritical;
exports.isCardPotentiallyPlayable = isCardPotentiallyPlayable;
exports.canCardPossiblyBeFromCluesOnly = canCardPossiblyBeFromCluesOnly;
exports.canCardPossiblyBeFromEmpathy = canCardPossiblyBeFromEmpathy;
exports.isAllCardPossibilitiesTrash = isAllCardPossibilitiesTrash;
const complete_common_1 = require("complete-common");
const constants_1 = require("../constants");
const CardStatus_1 = require("../enums/CardStatus");
const deck_1 = require("./deck");
const playStacks_1 = require("./playStacks");
const reversible_1 = require("./variants/reversible");
const sudoku_1 = require("./variants/sudoku");
const variantIdentity_1 = require("./variants/variantIdentity");
function getCardName(suitIndex, rank, variant) {
    const suit = variant.suits[suitIndex];
    if (suit === undefined) {
        return "unknown";
    }
    const rankName = rank === constants_1.START_CARD_RANK ? "START" : rank.toString();
    return `${suit.displayName} ${rankName}`;
}
/**
 * Returns true if the card is not yet played and is still needed to be played in order to get the
 * maximum score. This mirrors the server function "Card.NeedsToBePlayed()".
 */
function isCardNeededForMaxScore(suitIndex, rank, deck, playStacks, playStackDirections, playStackStarts, variant) {
    if (suitIndex === -1 || rank === -1) {
        return false;
    }
    // First, check to see if a copy of this card has already been played.
    const playStack = playStacks[suitIndex];
    if (playStack === undefined) {
        return false;
    }
    const playStackCards = (0, complete_common_1.filterMap)(playStack, (order) => deck[order]);
    if (playStackCards.some((card) => card.rank === rank)) {
        return false;
    }
    // Determining if the card needs to be played in variants with reversed suits is more complicated.
    if ((0, variantIdentity_1.hasReversedSuits)(variant)) {
        return (0, reversible_1.reversibleIsCardNeededForMaxScore)(suitIndex, rank, deck, playStacks, playStackDirections, variant);
    }
    // In Sudoku, checking this is also a bit tricky, since we might be able to play higher ranked
    // cards, even though lower ones are dead due to the ability to start stacks anywhere.
    if (variant.sudoku) {
        return (0, sudoku_1.sudokuIsCardNeededForMaxScore)(suitIndex, rank, deck, playStackStarts, variant);
    }
    // Second, check to see if it is still possible to play this card. (The preceding cards in the
    // suit might have already been discarded.)
    const { isAllDiscarded } = (0, deck_1.getDiscardHelpers)(variant, deck);
    for (const precedingRank of (0, complete_common_1.eRange)(1, rank)) {
        if (isAllDiscarded(suitIndex, precedingRank)) {
            // The suit is "dead", so this card does not need to be played anymore.
            return false;
        }
    }
    // By default, all cards not yet played will need to be played.
    return true;
}
function getCardStatus(suitIndex, rank, deck, playStacks, playStackDirections, playStackStarts, variant) {
    const cardNeedsToBePlayed = isCardNeededForMaxScore(suitIndex, rank, deck, playStacks, playStackDirections, playStackStarts, variant);
    if (cardNeedsToBePlayed) {
        if (isCardCritical(suitIndex, rank, deck, playStackDirections, variant)) {
            return CardStatus_1.CardStatus.Critical;
        }
        return CardStatus_1.CardStatus.NeedsToBePlayed;
    }
    return CardStatus_1.CardStatus.Trash;
}
/** This does not mirror any function on the server. */
function isCardCritical(suitIndex, rank, deck, playStackDirections, variant) {
    if (suitIndex === -1 || rank === -1) {
        return false;
    }
    // "Up or Down" has some special cases for critical cards.
    if ((0, variantIdentity_1.hasReversedSuits)(variant)) {
        return (0, reversible_1.reversibleIsCardCritical)(suitIndex, rank, deck, playStackDirections, variant);
    }
    const suit = variant.suits[suitIndex];
    if (suit === undefined) {
        return false;
    }
    const numTotal = (0, deck_1.getNumCopiesOfCard)(suit, rank, variant);
    const numDiscarded = (0, deck_1.getNumDiscardedCopiesOfCard)(deck, suitIndex, rank);
    return numTotal === numDiscarded + 1;
}
// Checks to see if every card possibility would misplay if the card was played right now.
function isCardPotentiallyPlayable(card, deck, playStacks, playStackDirections, playStackStarts, variant) {
    return card.possibleCards.some((possibleCard) => {
        const [suitIndex, rank] = possibleCard;
        // Always consider inverted cards to be "playable".
        const suit = variant.suits[suitIndex];
        if (suit !== undefined && suit.inverted) {
            return true;
        }
        const playStack = playStacks[suitIndex];
        if (playStack === undefined) {
            return false;
        }
        const playStackDirection = playStackDirections[suitIndex];
        if (playStackDirection === undefined) {
            return false;
        }
        const nextRanksArray = (0, playStacks_1.getNextPlayableRanks)(suitIndex, playStack, playStackDirection, playStackStarts, variant, deck);
        return nextRanksArray.includes(rank);
    });
}
function canCardPossiblyBeFromCluesOnly(card, suitIndex, rank) {
    if (suitIndex === null && rank === null) {
        // We have nothing to check.
        return true;
    }
    return card.possibleCardsFromClues.some(([s, r]) => (suitIndex === null || suitIndex === s) && (rank === null || rank === r));
}
function canCardPossiblyBeFromEmpathy(card, suitIndex, rank) {
    if (suitIndex === null && rank === null) {
        // We have nothing to check.
        return true;
    }
    return card.possibleCardsForEmpathy.some(([s, r]) => (suitIndex === null || suitIndex === s) && (rank === null || rank === r));
}
function isAllCardPossibilitiesTrash(card, deck, playStacks, playStackDirections, playStackStarts, variant, empathy) {
    // If we fully know the card already, just check if it's playable.
    if (!empathy && card.rank !== null && card.suitIndex !== null) {
        return !isCardNeededForMaxScore(card.suitIndex, card.rank, deck, playStacks, playStackDirections, playStackStarts, variant);
    }
    // Otherwise, check based on possibilities from clues/deduction.
    const possibilities = empathy
        ? card.possibleCardsForEmpathy
        : card.possibleCards;
    return !possibilities.some(([suitIndex, rank]) => isCardNeededForMaxScore(suitIndex, rank, deck, playStacks, playStackDirections, playStackStarts, variant));
}
//# sourceMappingURL=card.js.map