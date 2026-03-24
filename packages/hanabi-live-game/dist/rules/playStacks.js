"use strict";
/* eslint-disable unicorn/no-null */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNextPlayableRanks = getNextPlayableRanks;
exports.getLastPlayedRank = getLastPlayedRank;
exports.getStackDirection = getStackDirection;
exports.getStackStartRank = getStackStartRank;
const constants_1 = require("../constants");
const StackDirection_1 = require("../enums/StackDirection");
const variantIdentity_1 = require("./variants/variantIdentity");
/**
 * Returns an array since it is possible in some variants to have two or more possible cards that
 * are legal next plays.
 */
function getNextPlayableRanks(suitIndex, playStack, playStackDirection, playStackStarts, variant, deck) {
    const currentlyPlayedRank = getLastPlayedRank(playStack, deck);
    switch (playStackDirection) {
        case StackDirection_1.StackDirection.Undecided: {
            return currentlyPlayedRank === constants_1.START_CARD_RANK
                ? [2, 4]
                : [1, 5, constants_1.START_CARD_RANK];
        }
        case StackDirection_1.StackDirection.Up: {
            if (!variant.sudoku) {
                // In non-Sudoku variants, the next playable card is 1 if the stack is not stared yet or the
                // N+1 rank.
                return currentlyPlayedRank === null ? [1] : [currentlyPlayedRank + 1];
            }
            // In Sudoku variants, determining the next playable ranks is more complicated. If the stack
            // is already started, then we go up, wrapping around from 5 to 1 (unless the stack was
            // started at 1, in which case 5 will be the last card of this suit).
            if (currentlyPlayedRank !== null) {
                // We mod by the stack size and then add to obtain values [1, ..., stackSize].
                return [(currentlyPlayedRank % variant.stackSize) + 1];
            }
            // The stack is not started yet. As a special case, we might already know the start of the
            // play stack, even when no cards have been played when this is the last suit. In that case,
            // only the (known) stack start can be played.
            const playStackStart = playStackStarts[suitIndex];
            if (playStackStart !== undefined && playStackStart !== null) {
                return [playStackStart];
            }
            // If the stack is not started, it can be started with any rank that is not the starting rank
            // of another stack.
            return variant.ranks.filter((rank) => !playStackStarts.includes(rank));
        }
        case StackDirection_1.StackDirection.Down: {
            // In non-Sudoku variants, the next playable card is 5 if the stack is not stared yet or the
            // N-1 rank.
            return currentlyPlayedRank === null ? [5] : [currentlyPlayedRank - 1];
        }
        case StackDirection_1.StackDirection.Finished: {
            return [];
        }
    }
}
/** @returns `undefined` if there are no cards played on the stack. */
function getLastPlayedRank(playStack, deck) {
    const orderOfTopCard = playStack.at(-1);
    if (orderOfTopCard === undefined) {
        return null;
    }
    const card = deck[orderOfTopCard];
    if (card === undefined) {
        return null;
    }
    return card.rank;
}
function getStackDirection(suitIndex, playStack, deck, variant) {
    if (playStack.length === variant.stackSize) {
        return StackDirection_1.StackDirection.Finished;
    }
    if (!(0, variantIdentity_1.hasReversedSuits)(variant)) {
        return StackDirection_1.StackDirection.Up;
    }
    if (!variant.upOrDown) {
        const suit = variant.suits[suitIndex];
        if (suit === undefined) {
            return StackDirection_1.StackDirection.Up;
        }
        return suit.reversed ? StackDirection_1.StackDirection.Down : StackDirection_1.StackDirection.Up;
    }
    const top = getLastPlayedRank(playStack, deck);
    if (top === null || top === constants_1.START_CARD_RANK) {
        return StackDirection_1.StackDirection.Undecided;
    }
    // e.g. If top is 4 and there are 2 cards on the stack, it's going down.
    if (top !== playStack.length) {
        return StackDirection_1.StackDirection.Down;
    }
    if (top !== 3) {
        return StackDirection_1.StackDirection.Up;
    }
    // The only remaining case is if the top is 3, in which case there will always be 3 cards.
    const secondCardOrder = playStack[1];
    if (secondCardOrder === undefined) {
        return StackDirection_1.StackDirection.Up;
    }
    const secondCard = deck[secondCardOrder];
    if (secondCard === undefined) {
        return StackDirection_1.StackDirection.Up;
    }
    return secondCard.rank === 2 ? StackDirection_1.StackDirection.Up : StackDirection_1.StackDirection.Down;
}
/** Returns the rank of the bottom card of the stack. */
function getStackStartRank(playStack, deck) {
    const bottomCardOrder = playStack[0];
    if (bottomCardOrder === undefined) {
        return null;
    }
    const bottomCard = deck[bottomCardOrder];
    if (bottomCard === undefined) {
        return null;
    }
    return bottomCard.rank;
}
//# sourceMappingURL=playStacks.js.map