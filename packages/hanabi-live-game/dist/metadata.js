"use strict";
/* eslint-disable unicorn/no-null */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultMetadata = getDefaultMetadata;
const complete_common_1 = require("complete-common");
const constants_1 = require("./constants");
const gameData_1 = require("./gameData");
const Options_1 = require("./interfaces/Options");
const hand_1 = require("./rules/hand");
const stats_1 = require("./rules/stats");
const turn_1 = require("./rules/turn");
const hGroup_1 = require("./rules/variants/hGroup");
/**
 * This function is not used by the client, because the corresponding metadata for a game will
 * always come from the server.
 *
 * Thus, this function is useful for tests and bots.
 */
function getDefaultMetadata(numPlayers, variantName = constants_1.DEFAULT_VARIANT_NAME) {
    const options = {
        ...Options_1.defaultOptions,
        numPlayers,
        variantName,
    };
    const playerNames = constants_1.DEFAULT_PLAYER_NAMES.slice(0, numPlayers);
    const characterAssignments = (0, complete_common_1.newArray)(numPlayers, null);
    const characterMetadata = (0, complete_common_1.newArray)(numPlayers, -1);
    const variant = (0, gameData_1.getVariant)(variantName);
    const endGameLength = (0, turn_1.getEndGameLength)(options, characterAssignments);
    const cardsPerHand = (0, hand_1.getCardsPerHand)(options);
    const minEfficiency = (0, stats_1.getMinEfficiency)(numPlayers, endGameLength, variant, cardsPerHand);
    const hardVariant = (0, hGroup_1.isHardVariant)(variant, minEfficiency);
    return {
        ourUsername: "Alice",
        options,
        playerNames,
        ourPlayerIndex: 0,
        characterAssignments,
        characterMetadata,
        minEfficiency,
        hardVariant,
        hasCustomSeed: false,
        seed: "",
    };
}
//# sourceMappingURL=metadata.js.map