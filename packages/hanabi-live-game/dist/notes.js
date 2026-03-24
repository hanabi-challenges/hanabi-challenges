"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIdentityNotePatternForVariant = getIdentityNotePatternForVariant;
const complete_common_1 = require("complete-common");
/**
 * This function generates a regular expression that is used to detect "identity notes" (notes about
 * the possible identities of a card, such as `this is a [red 1]`).
 */
function getIdentityNotePatternForVariant(suits, ranks, suitAbbreviations, isUpOrDown) {
    const suitPattern = createSuitPattern(suits, suitAbbreviations);
    const rankPattern = createRankPattern(ranks, isUpOrDown);
    const squishPattern = createSquishPattern(suitAbbreviations, ranks, isUpOrDown);
    return `^(?:${suitPattern} ?${rankPattern}|${rankPattern} ?${suitPattern}|${suitPattern}|${rankPattern}|${squishPattern})$`;
}
function createSuitPattern(suits, suitAbbreviations) {
    if (suits.length !== suitAbbreviations.length) {
        throw new Error("The amount of suits were not the same as the amount of suit abbreviations.");
    }
    let alternation = "";
    for (const [suitIndex, suit] of suits.entries()) {
        if (suitIndex !== 0) {
            alternation += "|";
        }
        const suitAbbreviation = suitAbbreviations[suitIndex];
        (0, complete_common_1.assertDefined)(suitAbbreviation, `Failed to find the suit abbreviation for index: ${suitIndex}`);
        alternation += suitAbbreviation.toLowerCase();
        alternation += "|";
        alternation += suit.displayName.toLowerCase();
    }
    return `(${alternation})`;
}
function createRankPattern(ranks, isUpOrDown) {
    let rankStrings = ranks.map((r) => r.toString());
    if (isUpOrDown) {
        rankStrings = [...rankStrings, "0", "s", "start"];
    }
    return `(${rankStrings.join("|")})`;
}
function createSquishPattern(suitAbbreviations, ranks, isUpOrDown) {
    let rankStrings = ranks.map((r) => r.toString());
    if (isUpOrDown) {
        rankStrings = [...rankStrings, "0", "s"];
    }
    const allNoteLetters = [...rankStrings, ...suitAbbreviations];
    return `([${allNoteLetters.join("").toLowerCase()}]+)`;
}
//# sourceMappingURL=notes.js.map