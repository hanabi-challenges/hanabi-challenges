"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.colorClue = colorClue;
exports.rankClue = rankClue;
exports.draw = draw;
exports.discard = discard;
exports.play = play;
exports.actionCardIdentity = actionCardIdentity;
exports.strike = strike;
const ClueType_1 = require("./enums/ClueType");
/** Helper functions to build a color `ActionClue` with a compact syntax. For use in tests. */
function colorClue(value, giver, list, // We do not want to force the consumer to brand their numbers.
target) {
    return {
        type: "clue",
        clue: {
            type: ClueType_1.ClueType.Color,
            value,
        },
        giver,
        list: list,
        target,
        ignoreNegative: false,
    };
}
/** Helper functions to build a rank `ActionClue` with a compact syntax. For use in tests. */
function rankClue(value, giver, list, // We do not want to force the consumer to brand their numbers.
target) {
    return {
        type: "clue",
        clue: {
            type: ClueType_1.ClueType.Rank,
            value,
        },
        giver,
        list: list,
        target,
        ignoreNegative: false,
    };
}
/** Helper functions to build a `ActionDraw` with a compact syntax. For use in tests. */
function draw(playerIndex, order, // We do not want to force the consumer to brand their numbers.
suitIndex = -1, rank = -1) {
    return {
        type: "draw",
        playerIndex,
        order: order,
        suitIndex,
        rank,
    };
}
/** Helper functions to build a `ActionDiscard` with a compact syntax. For use in tests. */
function discard(playerIndex, order, // We do not want to force the consumer to brand their numbers.
suitIndex, rank, failed) {
    return {
        type: "discard",
        playerIndex,
        order: order,
        suitIndex,
        rank,
        failed,
    };
}
/** Helper functions to build a `ActionPlay` with a compact syntax. For use in tests. */
function play(playerIndex, order, // We do not want to force the consumer to brand their numbers.
suitIndex, rank) {
    return {
        type: "play",
        playerIndex,
        order: order,
        suitIndex,
        rank,
    };
}
/** Helper functions to build a `ActionCardIdentity` with a compact syntax. For use in tests. */
function actionCardIdentity(playerIndex, order, // We do not want to force the consumer to brand their numbers.
suitIndex, rank) {
    return {
        type: "cardIdentity",
        playerIndex,
        order: order,
        suitIndex,
        rank,
    };
}
/** Helper functions to build a `ActionStrike` with a compact syntax. For use in tests. */
function strike(num, order, // We do not want to force the consumer to brand their numbers.
turn) {
    return {
        type: "strike",
        num,
        order: order,
        turn,
    };
}
//# sourceMappingURL=testActions.js.map