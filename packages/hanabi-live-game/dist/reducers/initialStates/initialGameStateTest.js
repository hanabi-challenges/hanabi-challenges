"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInitialGameStateTest = getInitialGameStateTest;
const initialGameState_1 = require("./initialGameState");
const initialTurnState_1 = require("./initialTurnState");
function getInitialGameStateTest(metadata) {
    return {
        ...(0, initialGameState_1.getInitialGameState)(metadata),
        turn: {
            ...(0, initialTurnState_1.getInitialTurnState)(),
            segment: 0,
        },
    };
}
//# sourceMappingURL=initialGameStateTest.js.map