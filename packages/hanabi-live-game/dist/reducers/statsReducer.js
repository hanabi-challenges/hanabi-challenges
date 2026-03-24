"use strict";
// Functions for calculating running statistics such as efficiency and pace as a result of each
// action.
Object.defineProperty(exports, "__esModule", { value: true });
exports.statsReducer = void 0;
/* eslint-disable no-param-reassign */
/* eslint-disable unicorn/no-null */
const complete_common_1 = require("complete-common");
const immer_1 = require("immer");
const gameData_1 = require("../gameData");
const cardState_1 = require("../rules/cardState");
const clueTokens_1 = require("../rules/clueTokens");
const stats_1 = require("../rules/stats");
const turn_1 = require("../rules/turn");
exports.statsReducer = (0, immer_1.produce)(statsReducerFunction, {});
function statsReducerFunction(statsState, action, previousGameState, gameState, playing, shadowing, metadata, ourNotes) {
    const variant = (0, gameData_1.getVariant)(metadata.options.variantName);
    switch (action.type) {
        case "clue": {
            // A clue was spent.
            statsState.potentialCluesLost++;
            break;
        }
        case "strike": {
            // A strike is equivalent to losing a clue. But do not reveal that a strike has happened to
            // players in an ongoing "Throw It in a Hole" game.
            if (!variant.throwItInAHole || (!playing && !shadowing)) {
                statsState.potentialCluesLost += (0, clueTokens_1.getDiscardClueTokenValue)(variant);
            }
            break;
        }
        case "play": {
            if (action.suitIndex !== -1) {
                const playStack = gameState.playStacks[action.suitIndex];
                if (playStack !== undefined
                    && playStack.length === variant.stackSize
                    && previousGameState.clueTokens === gameState.clueTokens
                    && !variant.throwItInAHole // We do not get an extra clue in some variants.
                ) {
                    // If we finished a stack while at max clues, then the extra clue is "wasted", similar to
                    // what happens when the team gets a strike.
                    statsState.potentialCluesLost += (0, clueTokens_1.getDiscardClueTokenValue)(variant);
                }
            }
            break;
        }
        default: {
            break;
        }
    }
    const numEndGameTurns = (0, turn_1.getEndGameLength)(metadata.options, metadata.characterAssignments);
    // Handle max score calculation.
    if (action.type === "play" || action.type === "discard") {
        statsState.maxScorePerStack = (0, stats_1.getMaxScorePerStack)(gameState.deck, gameState.playStackDirections, gameState.playStackStarts, variant);
        statsState.maxScore = (0, complete_common_1.sumArray)(statsState.maxScorePerStack);
    }
    // Handle "numAttemptedCardsPlayed". (This needs to be before the pace calculation.)
    if ((action.type === "discard" && action.failed) || action.type === "play") {
        statsState.numAttemptedCardsPlayed++;
    }
    // Handle pace calculation.
    const score = variant.throwItInAHole && (playing || shadowing)
        ? statsState.numAttemptedCardsPlayed
        : gameState.score;
    statsState.pace = (0, stats_1.getPace)(score, gameState.cardsRemainingInTheDeck, statsState.maxScore, numEndGameTurns, 
    // `currentPlayerIndex` will be null if the game is over.
    gameState.turn.currentPlayerIndex === null);
    statsState.paceRisk = (0, stats_1.getPaceRisk)(statsState.pace, metadata.options.numPlayers);
    // Handle efficiency calculation.
    statsState.cardsGotten = (0, stats_1.getCardsGotten)(gameState.deck, gameState.playStacks, gameState.playStackDirections, gameState.playStackStarts, playing, shadowing, statsState.maxScore, variant);
    statsState.cardsGottenByNotes =
        ourNotes === null
            ? null
            : (0, stats_1.getCardsGottenByNotes)(gameState.deck, gameState.playStacks, gameState.playStackDirections, gameState.playStackStarts, variant, ourNotes);
    // Handle future efficiency calculation.
    const scorePerStack = gameState.playStacks.map((playStack) => playStack.length);
    const discardClueTokenValue = (0, clueTokens_1.getDiscardClueTokenValue)(variant);
    const suitCompleteClueTokenValue = (0, clueTokens_1.getSuitCompleteClueTokenValue)(variant);
    const unadjustedClueTokens = (0, clueTokens_1.getUnadjustedClueTokens)(gameState.clueTokens, variant);
    statsState.cluesStillUsable = (0, stats_1.getCluesStillUsable)(score, scorePerStack, statsState.maxScorePerStack, variant.stackSize, gameState.cardsRemainingInTheDeck, numEndGameTurns, discardClueTokenValue, suitCompleteClueTokenValue, unadjustedClueTokens);
    statsState.cluesStillUsableNotRounded = (0, stats_1.getCluesStillUsableNotRounded)(score, scorePerStack, statsState.maxScorePerStack, variant.stackSize, gameState.cardsRemainingInTheDeck, numEndGameTurns, discardClueTokenValue, suitCompleteClueTokenValue, unadjustedClueTokens);
    // Check if final round has effectively started because it is guaranteed to start in a fixed
    // number of turns.
    statsState.finalRoundEffectivelyStarted =
        gameState.cardsRemainingInTheDeck <= 0
            || statsState.cluesStillUsable === null
            || statsState.cluesStillUsable < 1;
    // Handle double discard calculation.
    if (action.type === "discard") {
        statsState.doubleDiscardCard = (0, stats_1.getDoubleDiscardCard)(action.order, gameState, variant);
    }
    else if (action.type === "play" || action.type === "clue") {
        statsState.doubleDiscardCard = null;
    }
    // Handle `numSubsequentBlindPlays`.
    if (isBlindPlay(action, gameState, variant)) {
        statsState.numSubsequentBlindPlays++;
    }
    else if (isOneOfThreeMainActions(action)) {
        statsState.numSubsequentBlindPlays = 0;
    }
    // Handle `numSubsequentMisplays`.
    if (action.type === "discard" && action.failed) {
        statsState.numSubsequentMisplays++;
    }
    else if (isOneOfThreeMainActions(action)) {
        statsState.numSubsequentMisplays = 0;
    }
}
function isBlindPlay(action, gameState, variant) {
    // In "Throw it in a Hole" variants, bombs should appear as successful plays.
    const possiblePlay = action.type === "play"
        || (variant.throwItInAHole && action.type === "discard" && action.failed);
    if (!possiblePlay) {
        return false;
    }
    const cardState = gameState.deck[action.order];
    const cardClued = cardState !== undefined && (0, cardState_1.isCardClued)(cardState);
    return !cardClued;
}
/** Whether the action was a clue, a discard, or a play. */
function isOneOfThreeMainActions(action) {
    return (action.type === "clue"
        || action.type === "discard"
        || action.type === "play");
}
//# sourceMappingURL=statsReducer.js.map