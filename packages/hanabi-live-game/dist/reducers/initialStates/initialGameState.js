"use strict";
/* eslint-disable unicorn/no-null */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInitialGameState = getInitialGameState;
const complete_common_1 = require("complete-common");
const constants_1 = require("../../constants");
const gameData_1 = require("../../gameData");
const card_1 = require("../../rules/card");
const clueTokens_1 = require("../../rules/clueTokens");
const deck_1 = require("../../rules/deck");
const hand_1 = require("../../rules/hand");
const playStacks_1 = require("../../rules/playStacks");
const stats_1 = require("../../rules/stats");
const turn_1 = require("../../rules/turn");
const initialTurnState_1 = require("./initialTurnState");
function getInitialGameState(metadata) {
    // Calculate some things before we get the game state properties.
    const { options } = metadata;
    const variant = (0, gameData_1.getVariant)(options.variantName);
    const playStacks = (0, complete_common_1.newArray)(variant.suits.length, []);
    const suitIndexes = [...variant.suits.keys()];
    const playStackDirections = suitIndexes.map((suitIndex) => (0, playStacks_1.getStackDirection)(suitIndex, [], [], variant));
    const playStackStarts = (0, complete_common_1.newArray)(variant.suits.length, null);
    // Game state properties
    const turn = (0, initialTurnState_1.getInitialTurnState)(options.startingPlayer);
    const cardsRemainingInTheDeck = (0, deck_1.getTotalCardsInDeck)(variant);
    const cardStatus = getInitialCardStatusMap(variant, playStacks, playStackDirections, playStackStarts);
    const clueTokens = (0, clueTokens_1.getAdjustedClueTokens)(constants_1.MAX_CLUE_NUM, variant);
    const hands = (0, complete_common_1.newArray)(options.numPlayers, []);
    const discardStacks = (0, complete_common_1.newArray)(variant.suits.length, []);
    // Stats properties
    const { maxScore } = variant;
    const maxScorePerStack = (0, complete_common_1.newArray)(variant.suits.length, variant.stackSize);
    const cardsPerHand = (0, hand_1.getCardsPerHand)(options);
    const startingDeckSize = (0, stats_1.getStartingDeckSize)(options.numPlayers, cardsPerHand, variant);
    const endGameLength = (0, turn_1.getEndGameLength)(metadata.options, metadata.characterAssignments);
    const pace = (0, stats_1.getStartingPace)(startingDeckSize, maxScore, endGameLength);
    const paceRisk = (0, stats_1.getPaceRisk)(pace, options.numPlayers);
    const scorePerStack = playStacks.map((playStack) => playStack.length);
    const discardClueValue = (0, clueTokens_1.getDiscardClueTokenValue)(variant);
    const suitClueValue = (0, clueTokens_1.getSuitCompleteClueTokenValue)(variant);
    const score = (0, complete_common_1.sumArray)(scorePerStack);
    const currentClues = (0, clueTokens_1.getUnadjustedClueTokens)(clueTokens, variant);
    const cluesStillUsableNotRounded = (0, stats_1.getCluesStillUsableNotRounded)(score, scorePerStack, maxScorePerStack, variant.stackSize, startingDeckSize, endGameLength, discardClueValue, suitClueValue, currentClues);
    const cluesStillUsable = cluesStillUsableNotRounded === null
        ? null
        : Math.floor(cluesStillUsableNotRounded);
    return {
        turn,
        log: [],
        deck: [],
        cardsRemainingInTheDeck,
        cardStatus,
        score: 0,
        clueTokens,
        strikes: [],
        hands,
        playStacks,
        playStackDirections,
        playStackStarts,
        hole: [],
        discardStacks,
        clues: [],
        stats: {
            maxScore,
            maxScorePerStack,
            pace,
            paceRisk,
            finalRoundEffectivelyStarted: false,
            cardsGotten: 0,
            cardsGottenByNotes: 0,
            potentialCluesLost: 0,
            cluesStillUsable,
            cluesStillUsableNotRounded,
            doubleDiscardCard: null,
            numSubsequentBlindPlays: 0,
            numSubsequentMisplays: 0,
            numAttemptedCardsPlayed: 0,
        },
    };
}
function getInitialCardStatusMap(variant, playStacks, playStackDirections, playStackStarts) {
    const cardStatusMap = {};
    for (const i of variant.suits.keys()) {
        const suitIndex = i;
        const suitStatuses = {};
        for (const rank of variant.ranks) {
            suitStatuses[rank] = (0, card_1.getCardStatus)(suitIndex, rank, [], playStacks, playStackDirections, playStackStarts, variant);
        }
        cardStatusMap[suitIndex] = suitStatuses;
    }
    return cardStatusMap;
}
//# sourceMappingURL=initialGameState.js.map