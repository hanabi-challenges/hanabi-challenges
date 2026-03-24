"use strict";
/* eslint-disable no-param-reassign */
Object.defineProperty(exports, "__esModule", { value: true });
exports.turnReducer = void 0;
const complete_common_1 = require("complete-common");
const immer_1 = require("immer");
const EndCondition_1 = require("../enums/EndCondition");
const gameData_1 = require("../gameData");
const deck_1 = require("../rules/deck");
const turn_1 = require("../rules/turn");
const reducerHelpers_1 = require("./reducerHelpers");
exports.turnReducer = (0, immer_1.produce)(turnReducerFunction, {});
function turnReducerFunction(turn, action, gameState, metadata) {
    const variant = (0, gameData_1.getVariant)(metadata.options.variantName);
    const characterName = (0, reducerHelpers_1.getCharacterNameForPlayer)(turn.currentPlayerIndex, metadata.characterAssignments);
    switch (action.type) {
        case "play": {
            turn.cardsPlayedOrDiscardedThisTurn++;
            if (gameState.cardsRemainingInTheDeck === 0) {
                if (turn.segment !== null) {
                    turn.segment++;
                }
                nextTurn(turn, gameState.cardsRemainingInTheDeck, characterName, metadata);
            }
            break;
        }
        case "discard": {
            turn.cardsPlayedOrDiscardedThisTurn++;
            if (!action.failed) {
                turn.cardsDiscardedThisTurn++;
            }
            if (gameState.cardsRemainingInTheDeck === 0) {
                if (turn.segment !== null) {
                    turn.segment++;
                }
                if ((0, turn_1.shouldEndTurnAfterDraw)(turn.cardsPlayedOrDiscardedThisTurn, turn.cardsDiscardedThisTurn, characterName, gameState.clueTokens, variant)) {
                    nextTurn(turn, gameState.cardsRemainingInTheDeck, characterName, metadata);
                }
            }
            break;
        }
        case "clue": {
            turn.cluesGivenThisTurn++;
            (0, complete_common_1.assertNotNull)(turn.segment, `A "${action.type}" action happened before all of the initial cards were dealt.`);
            turn.segment++;
            if ((0, turn_1.shouldEndTurnAfterClue)(turn.cluesGivenThisTurn, characterName)) {
                nextTurn(turn, gameState.cardsRemainingInTheDeck, characterName, metadata);
            }
            break;
        }
        case "draw": {
            if (turn.segment === null) {
                // If the initial deal is still going on.
                if ((0, deck_1.isInitialDealFinished)(gameState.cardsRemainingInTheDeck, metadata)) {
                    turn.segment = 0;
                }
            }
            else {
                // We do not want to increment the segment if we are drawing the final card of the deck in
                // order to perform a bottom-deck blind-play.
                if (turn.cardsPlayedOrDiscardedThisTurn > 0) {
                    turn.segment++;
                }
                if ((0, turn_1.shouldEndTurnAfterDraw)(turn.cardsPlayedOrDiscardedThisTurn, turn.cardsDiscardedThisTurn, characterName, gameState.clueTokens, variant)) {
                    nextTurn(turn, gameState.cardsRemainingInTheDeck, characterName, metadata);
                }
            }
            break;
        }
        case "gameOver": {
            (0, complete_common_1.assertNotNull)(turn.segment, `A "${action.type}" action happened before all of the initial cards were dealt.`);
            // Setting the current player index to null signifies that the game is over and will prevent
            // any name frames from being highlighted on subsequent segments.
            turn.currentPlayerIndex = null; // eslint-disable-line unicorn/no-null
            // For some types of game overs, we want the explanation text to appear on its own replay
            // segment. The types of "gameOver" that do not have to do with the previous action should be
            // on their own separate replay segment. Otherwise, we want the "gameOver" explanation to be
            // on the same segment as the final action. Any new end conditions must also be updated in the
            // "shouldStoreSegment()" function in "stateReducer.ts".
            if (action.endCondition === EndCondition_1.EndCondition.Timeout
                || action.endCondition === EndCondition_1.EndCondition.TerminatedByPlayer
                || action.endCondition === EndCondition_1.EndCondition.TerminatedByVote
                || action.endCondition === EndCondition_1.EndCondition.IdleTimeout) {
                turn.segment++;
            }
            break;
        }
        case "playerTimes": {
            (0, complete_common_1.assertNotNull)(turn.segment, `A "${action.type}" action happened before all of the initial cards were dealt.`);
            // At the end of the game, the server will send us how much time each player finished with as
            // well as the total game duration; we want all of this text on its own replay segment to
            // avoid cluttering the final turn of the game.
            turn.segment++;
            break;
        }
        default: {
            break;
        }
    }
}
function nextTurn(state, deckSize, characterName, metadata) {
    state.turnNum++;
    if ((0, turn_1.shouldPlayOrderInvert)(characterName)) {
        state.playOrderInverted = !state.playOrderInverted;
    }
    state.currentPlayerIndex = (0, turn_1.getNextPlayerIndex)(state.currentPlayerIndex, metadata.options.numPlayers, state.playOrderInverted);
    if (deckSize === 0 && state.endTurnNum === null) {
        state.endTurnNum = (0, turn_1.getEndTurn)(state.turnNum, metadata);
    }
    state.cardsPlayedOrDiscardedThisTurn = 0;
    state.cardsDiscardedThisTurn = 0;
    state.cluesGivenThisTurn = 0;
}
//# sourceMappingURL=turnReducer.js.map