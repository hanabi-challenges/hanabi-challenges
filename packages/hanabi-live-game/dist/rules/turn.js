"use strict";
/* eslint-disable unicorn/no-null */
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldEndTurnAfterDraw = shouldEndTurnAfterDraw;
exports.shouldEndTurnAfterClue = shouldEndTurnAfterClue;
exports.shouldPlayOrderInvert = shouldPlayOrderInvert;
exports.getNextPlayerIndex = getNextPlayerIndex;
exports.getEndGameLength = getEndGameLength;
exports.getEndTurn = getEndTurn;
const gameData_1 = require("../gameData");
const clueTokens_1 = require("./clueTokens");
function shouldEndTurnAfterDraw(cardsPlayedOrDiscardedThisTurn, cardsDiscardedThisTurn, characterName, clueTokens, variant) {
    // Some "Detrimental Characters" are able to perform two actions.
    // Panicky - After discarding, discards again if there are 4 clues or less.
    const panickyFirstDiscard = cardsDiscardedThisTurn === 1
        && clueTokens <= (0, clueTokens_1.getAdjustedClueTokens)(4, variant)
        && characterName === "Panicky";
    // Otherwise, the turn always increments when:
    // 1) a play or discard happens and
    // 2) a card is drawn
    return !panickyFirstDiscard && cardsPlayedOrDiscardedThisTurn >= 1;
}
function shouldEndTurnAfterClue(cluesGivenThisTurn, characterName) {
    // Some "Detrimental Characters" are able to perform two clues. Otherwise, the turn always
    // increments when a clue is given.
    return characterName !== "Genius" || cluesGivenThisTurn === 2;
}
function shouldPlayOrderInvert(characterName) {
    // Some "Detrimental Characters" are able to invert the play order.
    return characterName === "Contrarian";
}
function getNextPlayerIndex(currentPlayerIndex, numPlayers, turnsInverted) {
    // If the game is already over, then there is no next player.
    if (currentPlayerIndex === null) {
        return null;
    }
    if (turnsInverted) {
        let previousPlayerIndex = currentPlayerIndex - 1;
        if (previousPlayerIndex === -1) {
            previousPlayerIndex = numPlayers - 1;
        }
        return previousPlayerIndex;
    }
    let nextPlayerIndex = currentPlayerIndex + 1;
    if (nextPlayerIndex === numPlayers) {
        nextPlayerIndex = 0;
    }
    return nextPlayerIndex;
}
function getEndGameLength(options, characterAssignments) {
    // The Contrarian detrimental character has a 2-turn end game.
    if (options.detrimentalCharacters) {
        for (const characterID of characterAssignments) {
            if (characterID !== null) {
                const character = (0, gameData_1.getCharacter)(characterID);
                if (character.name === "Contrarian") {
                    return 2;
                }
            }
        }
    }
    // By default, each player gets one more turn after the final card is drawn.
    return options.numPlayers;
}
function getEndTurn(turn, metadata) {
    return (turn + getEndGameLength(metadata.options, metadata.characterAssignments));
}
//# sourceMappingURL=turn.js.map