"use strict";
// Functions related to the clue objects themselves: converting, getting names, etc.
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClueName = getClueName;
exports.msgClueToClue = msgClueToClue;
exports.isCardTouchedByClue = isCardTouchedByClue;
exports.isCardTouchedByClueColor = isCardTouchedByClueColor;
exports.getColorForPrismCard = getColorForPrismCard;
exports.isCardTouchedByClueRank = isCardTouchedByClueRank;
exports.shouldApplyClue = shouldApplyClue;
const complete_common_1 = require("complete-common");
const constants_1 = require("../constants");
const ClueType_1 = require("../enums/ClueType");
const reducerHelpers_1 = require("../reducers/reducerHelpers");
const Clue_1 = require("../types/Clue");
function getClueName(clueType, clueValue, variant, characterName) {
    if (variant.cowAndPig) {
        switch (clueType) {
            case ClueType_1.ClueType.Color: {
                return "Moo";
            }
            case ClueType_1.ClueType.Rank: {
                return "Oink";
            }
        }
    }
    if (variant.duck || characterName === "Quacker") {
        return "Quack";
    }
    if (variant.oddsAndEvens && clueType === ClueType_1.ClueType.Rank) {
        if (clueValue === 1) {
            return "Odd";
        }
        if (clueValue === 2) {
            return "Even";
        }
    }
    switch (clueType) {
        case ClueType_1.ClueType.Color: {
            const color = variant.clueColors[clueValue];
            return color === undefined ? "Unknown" : color.name;
        }
        case ClueType_1.ClueType.Rank: {
            return clueValue.toString();
        }
    }
}
/**
 * Convert a clue from the format used by the server to the format used by the client. On the
 * client, the color is a rich object. On the server, the color is a simple integer mapping.
 */
function msgClueToClue(msgClue, variant) {
    switch (msgClue.type) {
        case ClueType_1.ClueType.Color: {
            const color = variant.clueColors[msgClue.value];
            (0, complete_common_1.assertDefined)(color, `Failed to get the variant clue color at index: ${msgClue.value}`);
            return (0, Clue_1.newColorClue)(color);
        }
        case ClueType_1.ClueType.Rank: {
            const clueValue = msgClue.value;
            return (0, Clue_1.newRankClue)(clueValue);
        }
    }
}
/** This mirrors the function `variantIsCardTouched` in "variants.go". */
function isCardTouchedByClue(variant, clue, cardSuitIndex, cardRank) {
    const suit = variant.suits[cardSuitIndex];
    if (suit === undefined) {
        return false;
    }
    switch (clue.type) {
        case ClueType_1.ClueType.Color: {
            return isCardTouchedByClueColor(variant, clue.value, suit, cardRank);
        }
        case ClueType_1.ClueType.Rank: {
            return isCardTouchedByClueRank(variant, clue.value, cardSuitIndex, suit, cardRank);
        }
    }
}
function isCardTouchedByClueColor(variant, clueColor, cardSuit, cardRank) {
    if (variant.colorCluesTouchNothing) {
        return false;
    }
    if (cardSuit.allClueColors) {
        return true;
    }
    if (cardSuit.noClueColors) {
        return false;
    }
    if (variant.synesthesia && !cardSuit.noClueRanks) {
        // A card matches if it would match a prism card, in addition to normal color matches.
        const prismColorIndex = (cardRank - 1) % variant.clueColors.length;
        const color = variant.clueColors[prismColorIndex];
        if (color !== undefined && clueColor.name === color.name) {
            return true;
        }
    }
    if (cardRank === variant.specialRank) {
        if (variant.specialRankAllClueColors) {
            return true;
        }
        if (variant.specialRankNoClueColors) {
            return false;
        }
    }
    if (cardSuit.prism) {
        const prismColor = getColorForPrismCard(variant, cardRank);
        return clueColor.name === prismColor.name;
    }
    const suitClueColorNames = cardSuit.clueColors.map((suitClueColor) => suitClueColor.name);
    return suitClueColorNames.includes(clueColor.name);
}
/** The color that touches a prism card is contingent upon the card's rank. */
function getColorForPrismCard(variant, rank) {
    // "START" cards count as rank 0, so they are touched by the final color.
    const prismColorIndex = rank === constants_1.START_CARD_RANK
        ? variant.clueColors.length - 1
        : (rank - 1) % variant.clueColors.length;
    const prismColor = variant.clueColors[prismColorIndex];
    (0, complete_common_1.assertDefined)(prismColor, `Failed to get the color corresponding to a prism card of rank ${rank} for variant: ${variant.name}`);
    return prismColor;
}
function isCardTouchedByClueRank(variant, clueRank, cardSuitIndex, cardSuit, cardRank) {
    if (variant.rankCluesTouchNothing) {
        return false;
    }
    if (cardSuit.allClueRanks) {
        return true;
    }
    if (cardSuit.noClueRanks) {
        return false;
    }
    if (variant.funnels) {
        // Rank clues in Funnels touch also all lower ranked cards.
        return cardRank <= clueRank;
    }
    if (variant.chimneys) {
        // Rank clues in Chimneys touch also all lower ranked cards.
        return cardRank >= clueRank;
    }
    // Clue ranks in Odds And Evens can only be 1 or 2.
    if (variant.oddsAndEvens) {
        if (clueRank === 1) {
            return [1, 3, 5].includes(cardRank);
        }
        return [2, 4].includes(cardRank);
    }
    if (cardRank === variant.specialRank) {
        if (variant.specialRankAllClueRanks) {
            return true;
        }
        if (variant.specialRankNoClueRanks) {
            return false;
        }
        // The rank that touches a deceptive card is contingent upon the card's suit.
        if (variant.specialRankDeceptive) {
            const deceptiveRankIndex = cardSuitIndex % variant.clueRanks.length;
            const deceptiveRank = variant.clueRanks[deceptiveRankIndex];
            return clueRank === deceptiveRank;
        }
    }
    return clueRank === cardRank;
}
function shouldApplyClue(giverPlayerIndex, metadata, variant) {
    const giverCharacterName = (0, reducerHelpers_1.getCharacterNameForPlayer)(giverPlayerIndex, metadata.characterAssignments);
    return (!variant.cowAndPig && !variant.duck && giverCharacterName !== "Quacker");
}
//# sourceMappingURL=clues.js.map