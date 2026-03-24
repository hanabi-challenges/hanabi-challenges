"use strict";
// Functions to calculate game stats such as pace and efficiency.
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMaxScorePerStack = getMaxScorePerStack;
exports.getPace = getPace;
exports.getPaceRisk = getPaceRisk;
exports.getStartingDeckSize = getStartingDeckSize;
exports.getStartingPace = getStartingPace;
exports.getCardsGotten = getCardsGotten;
exports.getCardsGottenByNotes = getCardsGottenByNotes;
exports.getMinEfficiency = getMinEfficiency;
exports.getCluesStillUsableNotRounded = getCluesStillUsableNotRounded;
exports.getCluesStillUsable = getCluesStillUsable;
exports.getStartingCluesUsable = getStartingCluesUsable;
exports.getEfficiency = getEfficiency;
exports.getFutureEfficiency = getFutureEfficiency;
exports.getDoubleDiscardCard = getDoubleDiscardCard;
const complete_common_1 = require("complete-common");
const constants_1 = require("../constants");
const PaceRisk_1 = require("../enums/PaceRisk");
const card_1 = require("./card");
const cardState_1 = require("./cardState");
const clueTokens_1 = require("./clueTokens");
const deck_1 = require("./deck");
const hand_1 = require("./hand");
const reversible_1 = require("./variants/reversible");
const sudoku_1 = require("./variants/sudoku");
function getMaxScorePerStack(deck, playStackDirections, playStackStarts, variant) {
    // Sudoku-variants are quite complicated, since we need to solve an assignment problem for these.
    if (variant.sudoku) {
        return (0, sudoku_1.sudokuGetMaxScorePerStack)(deck, playStackStarts, variant);
    }
    // This handles the maximum scores in Reversed or "Up Or Down" variants.
    return (0, reversible_1.reversibleGetMaxScorePerStack)(deck, playStackDirections, variant);
}
function getMaxDiscardsBeforeFinalRound(cardsToPlay, deckSize, endGameLength) {
    if (cardsToPlay <= endGameLength + 1) {
        return deckSize - 1;
    }
    if (cardsToPlay <= endGameLength + deckSize) {
        return endGameLength + deckSize - cardsToPlay;
    }
    return 0;
}
function getMaxPlaysDuringFinalRound(cardsToPlay, endGameLength) {
    if (cardsToPlay < endGameLength + 1) {
        return cardsToPlay;
    }
    return endGameLength + 1;
}
function getMaxPlays(cardsToPlay, deckSize, endGameLength) {
    if (cardsToPlay <= endGameLength + deckSize) {
        return cardsToPlay;
    }
    return endGameLength + deckSize;
}
/** @returns The number of discards that can happen while still getting the maximum score. */
function getPace(score, deckSize, maxScore, endGameLength, gameOver) {
    if (gameOver) {
        return null;
    }
    if (deckSize <= 0) {
        return null;
    }
    // The formula for pace was derived by Libster.
    const adjustedScorePlusDeck = score + deckSize - maxScore;
    return adjustedScorePlusDeck + endGameLength;
}
/** @returns A measure of how risky a discard would be right now, using different heuristics. */
function getPaceRisk(currentPace, numPlayers) {
    if (currentPace === null) {
        return PaceRisk_1.PaceRisk.Low;
    }
    if (currentPace <= 0) {
        return PaceRisk_1.PaceRisk.Zero;
    }
    // Formula derived by Florrat; a strategical estimate of "End-Game" that tries to account for the
    // number of players.
    if (currentPace - numPlayers + Math.floor(numPlayers / 2) < 0) {
        return PaceRisk_1.PaceRisk.High;
    }
    // Formula derived by Hyphen-ated; a conservative estimate of "End-Game" that does not account for
    // the number of players.
    if (currentPace - numPlayers < 0) {
        return PaceRisk_1.PaceRisk.Medium;
    }
    return PaceRisk_1.PaceRisk.Low;
}
function getStartingDeckSize(numPlayers, cardsPerHand, variant) {
    const totalCardsInDeck = (0, deck_1.getTotalCardsInDeck)(variant);
    const initialCardsDrawn = cardsPerHand * numPlayers;
    return totalCardsInDeck - initialCardsDrawn;
}
/**
 * Calculate the starting pace with the following formula:
 *
 *  ```text
 *  total cards in the deck
 *  + number of turns in the final round
 *  - (number of cards in a player's hand * number of players)
 *  - (stackSize * number of suits)
 *  ```
 *
 * @see https://github.com/hanabi/hanabi.github.io/blob/main/misc/efficiency.md
 */
function getStartingPace(deckSize, maxScore, endGameLength) {
    return endGameLength + deckSize - maxScore;
}
function getCardsGotten(deck, playStacks, playStackDirections, playStackStarts, playing, shadowing, maxScore, variant) {
    let currentCardsGotten = 0;
    // Go through the deck and count the cards that are gotten.
    for (const cardState of deck) {
        if (cardState.location === "playStack"
            || (cardState.location === "discard"
                && cardState.isMisplayed
                && variant.throwItInAHole
                && (playing || shadowing))) {
            // A card is considered to be gotten if it is already played (and failed discards count as
            // played for the purposes of "Throw It in a Hole" variants).
            currentCardsGotten++;
        }
        else if ((0, cardState_1.isCardInPlayerHand)(cardState)
            && (0, cardState_1.isCardClued)(cardState)
            && !(0, card_1.isAllCardPossibilitiesTrash)(cardState, deck, playStacks, playStackDirections, playStackStarts, variant, false)) {
            // Clued cards in player's hands are considered to be gotten, since they will eventually be
            // played from Good Touch Principle (unless the card is globally known to be trash).
            currentCardsGotten++;
        }
    }
    if (currentCardsGotten > maxScore) {
        currentCardsGotten = maxScore;
    }
    return currentCardsGotten;
}
/** @returns The number of cards that are only gotten by notes and are not gotten by real clues. */
function getCardsGottenByNotes(deck, playStacks, playStackDirections, playStackStarts, variant, notes) {
    let numCardsGottenByNotes = 0;
    for (const [i, cardState] of deck.entries()) {
        const order = i;
        if ((0, cardState_1.isCardInPlayerHand)(cardState)
            && !(0, card_1.isAllCardPossibilitiesTrash)(cardState, deck, playStacks, playStackDirections, playStackStarts, variant, false)) {
            const adjustmentFromThisCard = getCardsGottenByNotesAdjustment(notes, order, cardState);
            numCardsGottenByNotes += adjustmentFromThisCard;
        }
    }
    return numCardsGottenByNotes;
}
function getCardsGottenByNotesAdjustment(notes, order, cardState) {
    const note = notes[order];
    if (!note) {
        return 0;
    }
    const isCluedForReal = (0, cardState_1.isCardClued)(cardState);
    if (isCluedForReal && (note.unclued || note.knownTrash)) {
        return -1;
    }
    if (isCluedForReal) {
        return 0;
    }
    const isCluedByNotes = (note.clued || note.finessed) && !note.unclued && !note.knownTrash;
    if (isCluedByNotes) {
        return 1;
    }
    return 0;
}
/** @returns The minimum amount of efficiency needed in order to win this variant. */
function getMinEfficiency(numPlayers, endGameLength, variant, cardsPerHand) {
    // First, calculate the starting pace:
    const deckSize = getStartingDeckSize(numPlayers, cardsPerHand, variant);
    // Second, use the pace to calculate the minimum efficiency required to win the game with the
    // following formula:
    // `max score / maximum number of clues that can be given before the game ends`
    const { maxScore } = variant;
    const totalClues = getStartingCluesUsable(endGameLength, deckSize, variant);
    return maxScore / totalClues;
}
/**
 * @returns The max number of clues that can be spent while getting the max possible score from a
 *          given game state onward (not accounting for the locations of playable cards).
 */
function getCluesStillUsableNotRounded(score, scorePerStack, maxScorePerStack, stackSize, deckSize, endGameLength, discardClueTokenValue, suitCompleteClueTokenValue, currentClues) {
    if (scorePerStack.length !== maxScorePerStack.length) {
        throw new Error("Failed to calculate efficiency: scorePerStack must have the same length as maxScorePerStack.");
    }
    // We want to discard as many times as possible while still getting a max score as long as
    // discardClueTokenValue >= suitCompleteClueTokenValue (which is currently true for all variants).
    if (discardClueTokenValue < suitCompleteClueTokenValue) {
        throw new Error("Cannot calculate efficiency in variants where discarding gives fewer clues than completing suits.");
    }
    if (deckSize <= 0) {
        return null;
    }
    const maxScore = (0, complete_common_1.sumArray)(maxScorePerStack);
    const missingScore = maxScore - score;
    const maxDiscardsBeforeFinalRound = getMaxDiscardsBeforeFinalRound(missingScore, deckSize, endGameLength);
    const cluesFromDiscards = maxDiscardsBeforeFinalRound * discardClueTokenValue;
    let cluesFromSuits = 0;
    if (suitCompleteClueTokenValue > 0) {
        // Compute how many suits we can complete before the final round.
        const playsDuringFinalRound = getMaxPlaysDuringFinalRound(missingScore, endGameLength);
        const minPlaysBeforeFinalRound = getMaxPlays(missingScore, deckSize, endGameLength)
            - playsDuringFinalRound;
        const missingCardsPerCompletableSuit = [];
        for (const [suitIndex, stackScore] of scorePerStack.entries()) {
            const stackMaxScore = maxScorePerStack[suitIndex];
            if (stackMaxScore === stackSize && stackScore < stackSize) {
                missingCardsPerCompletableSuit.push(stackMaxScore - stackScore);
            }
        }
        missingCardsPerCompletableSuit.sort((a, b) => a - b);
        let cardsPlayed = 0;
        let suitsCompletedBeforeFinalRound = 0;
        for (const missingCardsInSuit of missingCardsPerCompletableSuit) {
            if (cardsPlayed + missingCardsInSuit > minPlaysBeforeFinalRound) {
                break;
            }
            cardsPlayed += missingCardsInSuit;
            suitsCompletedBeforeFinalRound++;
        }
        cluesFromSuits =
            suitsCompletedBeforeFinalRound * suitCompleteClueTokenValue;
    }
    return cluesFromDiscards + cluesFromSuits + currentClues;
}
function getCluesStillUsable(score, scorePerStack, maxScorePerStack, stackSize, deckSize, endGameLength, discardClueTokenValue, suitCompleteClueTokenValue, currentClues) {
    const result = getCluesStillUsableNotRounded(score, scorePerStack, maxScorePerStack, stackSize, deckSize, endGameLength, discardClueTokenValue, suitCompleteClueTokenValue, currentClues);
    // Since we can't use up a fractional clue, we round it down for most purposes. This only matters
    // in Clue Starved variants.
    return result === null ? null : Math.floor(result);
}
/**
 * This is used as the denominator of an efficiency calculation:
 *
 * ```text
 * (8 + floor((starting pace + number of suits - unusable clues) * clues per discard))
 * ```
 *
 * @see https://github.com/hanabi/hanabi.github.io/blob/main/misc/efficiency.md
 */
function getStartingCluesUsable(endGameLength, deckSize, variant) {
    const score = 0;
    const scorePerStack = (0, complete_common_1.newArray)(variant.suits.length, 0);
    const maxScorePerStack = (0, complete_common_1.newArray)(variant.suits.length, variant.stackSize);
    const discardClueTokenValue = (0, clueTokens_1.getDiscardClueTokenValue)(variant);
    const suitCompleteClueTokenValue = (0, clueTokens_1.getSuitCompleteClueTokenValue)(variant);
    const startingClues = getCluesStillUsable(score, scorePerStack, maxScorePerStack, variant.stackSize, deckSize, endGameLength, discardClueTokenValue, suitCompleteClueTokenValue, constants_1.MAX_CLUE_NUM);
    (0, complete_common_1.assertNotNull)(startingClues, "The starting clues usable was null.");
    return startingClues;
}
function getEfficiency(numCardsGotten, potentialCluesLost) {
    return numCardsGotten / potentialCluesLost;
}
function getFutureEfficiency(gameState) {
    if (gameState.stats.cluesStillUsable === null) {
        return null;
    }
    const cardsNotGotten = gameState.stats.maxScore - gameState.stats.cardsGotten;
    return cardsNotGotten / gameState.stats.cluesStillUsable;
}
/**
 * After a discard, it is a "double discard" situation if there is only one other copy of this card
 * and it needs to be played.
 */
function getDoubleDiscardCard(orderOfDiscardedCard, gameState, variant) {
    const cardDiscarded = gameState.deck[orderOfDiscardedCard];
    if (cardDiscarded === undefined) {
        return null;
    }
    // It is never a double discard situation if the game is over.
    if (gameState.turn.currentPlayerIndex === null) {
        return null;
    }
    // It is never a double discard situation if the next player has one or more positive clues on
    // every card in their hand.
    const nextPlayerIndex = (gameState.turn.currentPlayerIndex + 1) % gameState.hands.length;
    const hand = gameState.hands[nextPlayerIndex];
    if (hand !== undefined) {
        const nextPlayerLocked = (0, hand_1.isHandLocked)(hand, gameState.deck);
        if (nextPlayerLocked) {
            return null;
        }
    }
    // It is never a double discard situation if we do not know the identity of the discarded card
    // (which can happen in certain variants).
    if (cardDiscarded.suitIndex === null || cardDiscarded.rank === null) {
        return null;
    }
    // It is never a double discard situation if the discarded card does not need to be played.
    const neededForMaxScore = (0, card_1.isCardNeededForMaxScore)(cardDiscarded.suitIndex, cardDiscarded.rank, gameState.deck, gameState.playStacks, gameState.playStackDirections, gameState.playStackStarts, variant);
    if (!neededForMaxScore) {
        return null;
    }
    // It is never a double discard situation if another player has a copy of the card in their hand
    // that happens to be fully "fill-in" from clues.
    for (const cardInDeck of gameState.deck) {
        if (cardInDeck.order !== cardDiscarded.order
            && cardInDeck.suitIndex === cardDiscarded.suitIndex
            && cardInDeck.rank === cardDiscarded.rank
            && typeof cardInDeck.location === "number" // The card is in a player's hand
            && cardInDeck.possibleCardsFromClues.length === 1 // The card is fully "filled-in"
        ) {
            return null;
        }
    }
    // Otherwise, it is a double discard situation if there is only one copy of the card left.
    const suit = variant.suits[cardDiscarded.suitIndex];
    if (suit === undefined) {
        return null;
    }
    const numCopiesTotal = (0, deck_1.getNumCopiesOfCard)(suit, cardDiscarded.rank, variant);
    const numDiscarded = (0, deck_1.getNumDiscardedCopiesOfCard)(gameState.deck, cardDiscarded.suitIndex, cardDiscarded.rank);
    return numCopiesTotal === numDiscarded + 1 ? orderOfDiscardedCard : null;
}
//# sourceMappingURL=stats.js.map