"use strict";
// Functions related to clues: gaining clues, giving clues, applying clues.
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNewClueTokensAfterAction = getNewClueTokensAfterAction;
exports.getAdjustedClueTokens = getAdjustedClueTokens;
exports.getUnadjustedClueTokens = getUnadjustedClueTokens;
exports.isAtMaxClueTokens = isAtMaxClueTokens;
exports.getDiscardClueTokenValue = getDiscardClueTokenValue;
exports.getSuitCompleteClueTokenValue = getSuitCompleteClueTokenValue;
const constants_1 = require("../constants");
/** Gain a clue by discarding or finishing a stack. */
function getNewClueTokensAfterAction(action, clueTokens, variant, playStackComplete = false) {
    if (shouldActionGenerateClueToken(action, clueTokens, variant, playStackComplete)) {
        return clueTokens + 1;
    }
    return clueTokens;
}
function shouldActionGenerateClueToken(action, clueTokens, variant, playStackComplete) {
    if (isAtMaxClueTokens(clueTokens, variant)) {
        return false;
    }
    switch (action.type) {
        case "play": {
            // Finishing a play stack grants an extra clue (but not in certain variants).
            return playStackComplete && !variant.throwItInAHole;
        }
        case "discard": {
            // Discarding a card grants an extra clue. But misplayed cards do not grant extra clues.
            return !action.failed;
        }
    }
}
/**
 * In "Clue Starved" variants, each discard only grants 0.5 clue tokens. This is represented on the
 * client by discards granting 1 clue token and clues costing 2 tokens (to avoid having to use
 * floating point numbers).
 *
 * Thus, for a "Clue Starved" variant, if the unadjusted clue tokens were 2, the adjusted clue
 * tokens would be 4.
 */
function getAdjustedClueTokens(clueTokens, variant) {
    return variant.clueStarved ? clueTokens * 2 : clueTokens;
}
/** See the documentation for the `getAdjustedClueTokens` function. */
function getUnadjustedClueTokens(clueTokensAdjusted, variant) {
    return variant.clueStarved ? clueTokensAdjusted / 2 : clueTokensAdjusted;
}
function isAtMaxClueTokens(clueTokens, variant) {
    return clueTokens >= getAdjustedClueTokens(constants_1.MAX_CLUE_NUM, variant);
}
/**
 * The value of clues gained when discarding. This function is only used in efficiency calculations
 * (because we do not want to use floating point numbers for the general case).
 *
 * In "Clue Starved" variants, each discard gives only half a clue.
 */
function getDiscardClueTokenValue(variant) {
    return variant.clueStarved ? 0.5 : 1;
}
/**
 * The value of clues gained when completing a suit. This function is only used in efficiency
 * calculations (because we do not want to use floating point numbers for the general case).
 */
function getSuitCompleteClueTokenValue(variant) {
    if (variant.throwItInAHole) {
        return 0;
    }
    return variant.clueStarved ? 0.5 : 1;
}
//# sourceMappingURL=clueTokens.js.map