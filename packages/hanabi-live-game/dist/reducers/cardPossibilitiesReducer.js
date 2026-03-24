"use strict";
// Calculates the state of a card after a clue.
Object.defineProperty(exports, "__esModule", { value: true });
exports.cardPossibilitiesReducer = cardPossibilitiesReducer;
/* eslint-disable unicorn/no-null */
const complete_common_1 = require("complete-common");
const constants_1 = require("../constants");
const ClueType_1 = require("../enums/ClueType");
const gameData_1 = require("../gameData");
const clues_1 = require("../rules/clues");
function cardPossibilitiesReducer(state, clue, positive, metadata) {
    if (state.possibleCardsFromClues.length === 1) {
        // We already know all details about this card, no need to calculate.
        return state;
    }
    const variant = (0, gameData_1.getVariant)(metadata.options.variantName);
    // Apply the clue and check what is eliminated.
    const possibleCardsFromClues = state.possibleCardsFromClues.filter(([suitIndex, rank]) => (0, clues_1.isCardTouchedByClue)(variant, clue, suitIndex, rank) === positive);
    const possibleCards = state.possibleCards.filter(([suitIndex, rank]) => (0, clues_1.isCardTouchedByClue)(variant, clue, suitIndex, rank) === positive);
    const possibleCardsForEmpathy = state.possibleCardsForEmpathy.filter(([suitIndex, rank]) => (0, clues_1.isCardTouchedByClue)(variant, clue, suitIndex, rank) === positive);
    let { positiveColorClues } = state;
    if (positive
        && clue.type === ClueType_1.ClueType.Color
        && !positiveColorClues.includes(clue.value)) {
        positiveColorClues = [...positiveColorClues, clue.value];
    }
    let { positiveRankClues } = state;
    if (positive
        && clue.type === ClueType_1.ClueType.Rank
        && !positiveRankClues.includes(clue.value)) {
        if (variant.oddsAndEvens) {
            positiveRankClues =
                clue.value === 1
                    ? [...positiveRankClues, 1, 3, 5]
                    : [...positiveRankClues, 2, 4];
        }
        else {
            positiveRankClues = [...positiveRankClues, clue.value];
        }
    }
    const { suitIndex, rank, suitDetermined, rankDetermined, revealedToPlayer } = updateIdentity(state, possibleCardsFromClues);
    const newState = {
        ...state,
        suitIndex,
        rank,
        suitDetermined,
        rankDetermined,
        possibleCardsFromClues,
        possibleCards,
        possibleCardsForEmpathy,
        positiveColorClues,
        positiveRankClues,
        revealedToPlayer,
    };
    return newState;
}
/** Based on the current possibilities, updates the known identity of this card. */
function updateIdentity(state, possibleCardsFromClues) {
    let { suitIndex, rank } = state;
    const possibleSuits = possibleCardsFromClues.map((suitRankTuple) => suitRankTuple[0]);
    const possibleSuitsSet = new Set(possibleSuits);
    const suitDetermined = possibleSuitsSet.size === 1;
    if (suitDetermined) {
        suitIndex = possibleSuits[0] ?? null;
    }
    const possibleRanks = possibleCardsFromClues.map((suitRankTuple) => suitRankTuple[1]);
    const possibleRanksSet = new Set(possibleRanks);
    const rankDetermined = possibleRanksSet.size === 1;
    if (rankDetermined) {
        rank = possibleRanks[0] ?? null;
    }
    return {
        suitIndex,
        rank,
        suitDetermined,
        rankDetermined,
        revealedToPlayer: suitDetermined && rankDetermined
            ? (0, complete_common_1.newArray)(constants_1.MAX_PLAYERS, true)
            : state.revealedToPlayer,
    };
}
//# sourceMappingURL=cardPossibilitiesReducer.js.map