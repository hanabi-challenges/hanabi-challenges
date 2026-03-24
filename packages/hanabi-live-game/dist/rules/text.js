"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGoesFirstText = getGoesFirstText;
exports.getClueText = getClueText;
exports.getGameOverText = getGameOverText;
exports.getPlayText = getPlayText;
exports.getDiscardText = getDiscardText;
exports.getPlayerName = getPlayerName;
exports.millisecondsToClockString = millisecondsToClockString;
const complete_common_1 = require("complete-common");
const ClueType_1 = require("../enums/ClueType");
const EndCondition_1 = require("../enums/EndCondition");
const gameData_1 = require("../gameData");
const reducerHelpers_1 = require("../reducers/reducerHelpers");
const card_1 = require("./card");
const clues_1 = require("./clues");
const hand_1 = require("./hand");
const HYPO_PREFIX = "[Hypo] ";
const NUMBER_WORDS = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
];
function getGoesFirstText(playerIndex, playerNames) {
    const playerName = playerIndex === null
        ? "[unknown]"
        : (playerNames[playerIndex] ?? "[unknown]");
    return `${playerName} goes first`;
}
function getClueText(action, targetHand, hypothetical, metadata) {
    const giver = metadata.playerNames[action.giver] ?? "unknown";
    const target = metadata.playerNames[action.target] ?? "unknown";
    const word = NUMBER_WORDS[action.list.length] ?? "unknown";
    const variant = (0, gameData_1.getVariant)(metadata.options.variantName);
    const hypoPrefix = hypothetical ? HYPO_PREFIX : "";
    // First, handle the case of clue text in some special variants.
    const characterName = (0, reducerHelpers_1.getCharacterNameForPlayer)(action.giver, metadata.characterAssignments);
    if (variant.cowAndPig || variant.duck || characterName === "Quacker") {
        const actionName = getClueActionName(action.clue, variant, characterName);
        const targetSuffix = target.endsWith("s") ? "'" : "'s";
        // Create a list of slot numbers that correspond to the cards touched.
        const slots = [];
        for (const order of action.list) {
            const slot = (0, hand_1.getCardSlot)(order, targetHand);
            (0, complete_common_1.assertDefined)(slot, `Failed to get the slot for card: ${order}`);
            slots.push(slot);
        }
        slots.sort((a, b) => a - b);
        const slotWord = slots.length === 1 ? "slot" : "slots";
        const slotsText = slots.join("/");
        return `${hypoPrefix}${giver} ${actionName} at ${target}${targetSuffix} ${slotWord} ${slotsText}`;
    }
    // Handle the default case of a normal clue.
    let clueName = (0, clues_1.getClueName)(action.clue.type, action.clue.value, variant, characterName);
    if (action.list.length !== 1) {
        clueName += "s";
    }
    return `${hypoPrefix}${giver} tells ${target} about ${word} ${clueName}`;
}
function getClueActionName(msgClue, variant, characterName) {
    if (variant.cowAndPig) {
        switch (msgClue.type) {
            case ClueType_1.ClueType.Color: {
                return "moos";
            }
            case ClueType_1.ClueType.Rank: {
                return "oinks";
            }
        }
    }
    if (variant.duck || characterName === "Quacker") {
        return "quacks";
    }
    return "clues";
}
function getGameOverText(endCondition, playerIndex, score, metadata, votes) {
    const playerName = getPlayerName(playerIndex, metadata);
    switch (endCondition) {
        case EndCondition_1.EndCondition.InProgress:
        case EndCondition_1.EndCondition.Normal: {
            return `Players score ${score} points.`;
        }
        case EndCondition_1.EndCondition.Strikeout: {
            break;
        }
        case EndCondition_1.EndCondition.Timeout: {
            return `${playerName} ran out of time!`;
        }
        case EndCondition_1.EndCondition.TerminatedByPlayer: {
            return `${playerName} terminated the game!`;
        }
        case EndCondition_1.EndCondition.TerminatedByVote: {
            const playerNames = getPlayerNames(votes, metadata);
            return `${playerNames} voted to terminate the game!`;
        }
        case EndCondition_1.EndCondition.SpeedrunFail: {
            break;
        }
        case EndCondition_1.EndCondition.IdleTimeout: {
            return "Players were idle for too long.";
        }
        case EndCondition_1.EndCondition.CharacterSoftlock: {
            return `${playerName} was left with 0 clues!`;
        }
        case EndCondition_1.EndCondition.AllOrNothingFail: {
            break;
        }
        case EndCondition_1.EndCondition.AllOrNothingSoftlock: {
            return `${playerName} was left with 0 clues and 0 cards!`;
        }
    }
    return "Players lose!";
}
function getPlayerNames(playerIndices, metadata) {
    if (playerIndices === null) {
        return "The players";
    }
    const playerNames = playerIndices.map((i) => getPlayerName(i, metadata));
    playerNames.sort();
    if (playerNames.length === 2) {
        return `${playerNames[0]} and ${playerNames[1]}`;
    }
    const playerNamesExceptLast = playerNames.slice(0, -1);
    return `${playerNamesExceptLast.join(", ")}, and ${playerNames.at(-1)}`;
}
function getPlayText(action, slot, touched, playing, shadowing, hypothetical, metadata) {
    const variant = (0, gameData_1.getVariant)(metadata.options.variantName);
    const playerName = getPlayerName(action.playerIndex, metadata);
    const cardIsHidden = action.suitIndex === -1
        || action.rank === -1
        || (variant.throwItInAHole && (playing || shadowing));
    const cardName = cardIsHidden
        ? "a card"
        : (0, card_1.getCardName)(action.suitIndex, action.rank, variant);
    const location = slot === null ? "the deck" : `slot #${slot}`;
    const suffix = touched ? "" : " (blind)";
    const hypoPrefix = hypothetical ? HYPO_PREFIX : "";
    const playText = action.type === "discard" && action.failed && !cardIsHidden
        ? "fails to play"
        : "plays";
    return `${hypoPrefix}${playerName} ${playText} ${cardName} from ${location}${suffix}`;
}
function getDiscardText(action, slot, touched, critical, playing, shadowing, hypothetical, metadata) {
    if (action.failed) {
        return getPlayText(action, slot, touched, playing, shadowing, hypothetical, metadata);
    }
    const variant = (0, gameData_1.getVariant)(metadata.options.variantName);
    const playerName = getPlayerName(action.playerIndex, metadata);
    const cardIsHidden = action.suitIndex === -1
        || action.rank === -1
        || (variant.throwItInAHole && (playing || shadowing));
    const cardName = cardIsHidden
        ? "a card"
        : (0, card_1.getCardName)(action.suitIndex, action.rank, variant);
    const location = slot === null ? "the deck" : `slot #${slot}`;
    const suffix = getDiscardTextSuffix(touched, critical);
    const hypoPrefix = hypothetical ? HYPO_PREFIX : "";
    return `${hypoPrefix}${playerName} discards ${cardName} from ${location}${suffix}`;
}
function getDiscardTextSuffix(touched, critical) {
    // The critical suffix takes precedence over the clued suffix.
    if (critical) {
        return " (critical)";
    }
    if (touched) {
        return " (clued)";
    }
    return "";
}
function getPlayerName(playerIndex, metadata) {
    return metadata.playerNames[playerIndex] ?? "[unknown]";
}
function millisecondsToClockString(milliseconds) {
    // Non timed games measure time in negative values.
    const time = Math.abs(milliseconds);
    const seconds = Math.ceil(time / complete_common_1.SECOND_IN_MILLISECONDS);
    const minutes = Math.floor(seconds / 60);
    const paddedSeconds = pad2(seconds % 60);
    return `${minutes}:${paddedSeconds}`;
}
function pad2(num) {
    if (num < 10) {
        return `0${num}`;
    }
    return `${num}`;
}
//# sourceMappingURL=text.js.map