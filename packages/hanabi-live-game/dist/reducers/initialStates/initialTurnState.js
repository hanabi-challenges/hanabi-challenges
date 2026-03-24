"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInitialTurnState = getInitialTurnState;
function getInitialTurnState(startingPlayerIndex = 0) {
    return {
        segment: null, // eslint-disable-line unicorn/no-null
        turnNum: 0,
        currentPlayerIndex: startingPlayerIndex,
        playOrderInverted: false,
        endTurnNum: null, // eslint-disable-line unicorn/no-null
        cardsPlayedOrDiscardedThisTurn: 0,
        cardsDiscardedThisTurn: 0,
        cluesGivenThisTurn: 0,
    };
}
//# sourceMappingURL=initialTurnState.js.map