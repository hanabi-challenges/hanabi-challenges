"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_RESERVED_NOTES = exports.UNCLUED_NOTES = exports.CLUED_NOTES = exports.BLANK_NOTES = exports.NEEDS_FIX_NOTES = exports.FINESSED_NOTES = exports.CHOP_MOVED_NOTES = exports.EXCLAMATION_MARK_NOTES = exports.QUESTION_MARK_NOTES = exports.KNOWN_TRASH_NOTES = void 0;
exports.getUppercaseSuitAbbreviationsForVariant = getUppercaseSuitAbbreviationsForVariant;
exports.getSuitAbbreviationForVariant = getSuitAbbreviationForVariant;
const complete_common_1 = require("complete-common");
exports.KNOWN_TRASH_NOTES = ["kt", "trash", "stale", "bad"];
exports.QUESTION_MARK_NOTES = ["?"];
exports.EXCLAMATION_MARK_NOTES = ["!"];
exports.CHOP_MOVED_NOTES = [
    "cm",
    "chop move",
    "chop moved",
    // cspell:disable
    "5cm", // 5's Chop Move
    "e5cm", // Early 5's Chop Move
    "tcm", // Trash Chop Move
    "tccm", // Tempo Clue Chop Move
    "sdcm", // Scream Discard Chop Move
    "esdcm", // Echo Scream Discard Chop Move
    "sbpcm", // Scream Blind Play Chop Move
    "ocm", // Order Chop Move
    "tocm", // Trash Order Chop Move
    "mcm", // Misplay Chop Move
    "uutdcm", // Unnecessary Unknown Trash Discharge Chop Move
    "uuddcm", // Unnecessary Unknown Dupe Discharge Chop Move
    "dtccm", // Duplicitous Tempo Clue Chop Move
    "atcm", // Assisted Trash Chop Move
    "ttcm", // Time Travel Chop Move
    // cspell:enable
];
exports.FINESSED_NOTES = [
    "f", // Finesse
    "hf", // Hidden Finesse
    "sf", // Sarcastic Finesse
    "cf", // Certain Finesse / Composition Finesse
    "pf", // Priority Finesse
    "gd", // Gentleman's Discard
];
exports.NEEDS_FIX_NOTES = ["fix", "fixme", "needs fix"];
exports.BLANK_NOTES = ["blank", "unknown"];
exports.CLUED_NOTES = ["clued", "cl"];
exports.UNCLUED_NOTES = ["unclued", "x"];
/**
 * Contains only lowercase letters. Thus, when checking against the set, the input must also be
 * lowercase.
 */
exports.ALL_RESERVED_NOTES = new complete_common_1.ReadonlySet([
    ...exports.KNOWN_TRASH_NOTES,
    ...exports.QUESTION_MARK_NOTES,
    ...exports.EXCLAMATION_MARK_NOTES,
    ...exports.CHOP_MOVED_NOTES,
    ...exports.FINESSED_NOTES,
    ...exports.NEEDS_FIX_NOTES,
    ...exports.BLANK_NOTES,
    ...exports.CLUED_NOTES,
    ...exports.UNCLUED_NOTES,
]);
/**
 * Suit abbreviations are hard-coded in the "suits.json" file. In some variants, two or more suits
 * can have overlapping letter abbreviations. If this is the case, we dynamically find a new
 * abbreviation by using the left-most unused letter.
 *
 * Note that we cannot simply hard-code an alternate abbreviation in the "suits.json" file because
 * there are too many overlapping possibilities.
 */
function getUppercaseSuitAbbreviationsForVariant(variantName, suits) {
    const lowercaseAbbreviations = [];
    for (const suit of suits) {
        const lowercaseAbbreviationToUse = getLowercaseSuitAbbreviationToUse(variantName, suit, lowercaseAbbreviations);
        lowercaseAbbreviations.push(lowercaseAbbreviationToUse);
    }
    // Validate that each suit has a valid abbreviation.
    for (const abbreviation of lowercaseAbbreviations) {
        if (abbreviation.trim() === "") {
            throw new Error(`The variant "${variantName}" has an invalid suit abbreviation.`);
        }
    }
    // Validate that each suit has a unique abbreviation.
    const abbreviationSet = new Set(lowercaseAbbreviations);
    if (abbreviationSet.size !== lowercaseAbbreviations.length) {
        throw new Error(`The variant "${variantName}" has two suits with the same abbreviation: ${lowercaseAbbreviations}`);
    }
    return lowercaseAbbreviations.map((abbreviation) => abbreviation.toUpperCase());
}
function getLowercaseSuitAbbreviationToUse(variantName, suit, lowercaseAbbreviationsUsedSoFar) {
    const lowercaseAbbreviation = suit.abbreviation.toLowerCase();
    if (!lowercaseAbbreviationsUsedSoFar.includes(lowercaseAbbreviation)) {
        return lowercaseAbbreviation;
    }
    // There is an overlap with the normal abbreviation.
    const suitCharactersToConsider = (0, complete_common_1.trimPrefix)(suit.displayName, "Dark ");
    for (const suitCharacter of suitCharactersToConsider) {
        if (suitCharacter === " ") {
            continue;
        }
        const suitLetterLowercase = suitCharacter.toLowerCase();
        if (!lowercaseAbbreviationsUsedSoFar.includes(suitLetterLowercase)
            && !exports.ALL_RESERVED_NOTES.has(suitLetterLowercase) // e.g. Ban "f"
        ) {
            return suitLetterLowercase;
        }
    }
    throw new Error(`Failed to find a suit abbreviation for "${suit.name}" in the variant of "${variantName}". (We went through every letter and did not find a match.)`);
}
/**
 * Given an existing variant, find the suit abbreviation for a suit. (Suit abbreviations are dynamic
 * and depend on the specific variant.)
 *
 * It is possible for this function to take in the "Unknown" suit, so we want to provide a fallback
 * without throwing an error.
 */
function getSuitAbbreviationForVariant(suitToMatch, variant) {
    const suitIndex = variant.suits.findIndex((suit) => suit.name === suitToMatch.name);
    if (suitIndex === -1) {
        return "?";
    }
    const suitAbbreviation = variant.suitAbbreviations[suitIndex];
    return suitAbbreviation ?? "?";
}
//# sourceMappingURL=abbreviations.js.map