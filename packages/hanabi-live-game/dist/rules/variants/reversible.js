"use strict";
// Helper methods for variants where suits may have a different direction than up. This is currently
// used for "Up Or Down" and "Reversed" variants.
Object.defineProperty(exports, "__esModule", { value: true });
exports.reversibleIsCardNeededForMaxScore = reversibleIsCardNeededForMaxScore;
exports.reversibleGetRanksUsefulForMaxScore = reversibleGetRanksUsefulForMaxScore;
exports.reversibleGetMaxScorePerStack = reversibleGetMaxScorePerStack;
exports.reversibleIsCardCritical = reversibleIsCardCritical;
const complete_common_1 = require("complete-common");
const constants_1 = require("../../constants");
const StackDirection_1 = require("../../enums/StackDirection");
const deck_1 = require("../deck");
const playStacks_1 = require("../playStacks");
/**
 * Returns true if this card still needs to be played in order to get the maximum score (taking the
 * stack direction into account). (Before reaching this function, we have already checked to see if
 * the card has been played.) This function mirrors the server function
 * "variantReversibleNeedsToBePlayed()".
 */
function reversibleIsCardNeededForMaxScore(suitIndex, rank, deck, playStacks, playStackDirections, variant) {
    const playStack = playStacks[suitIndex];
    if (playStack === undefined) {
        return false;
    }
    const lastPlayedRank = (0, playStacks_1.getLastPlayedRank)(playStack, deck);
    const allDiscardedSet = (0, deck_1.getAllDiscardedSetForSuit)(variant, deck, suitIndex);
    const direction = playStackDirections[suitIndex];
    const usefulRanks = reversibleGetRanksUsefulForMaxScore(lastPlayedRank, allDiscardedSet, direction);
    return usefulRanks.has(rank);
}
function reversibleGetRanksUsefulForMaxScore(lastPlayed, allDiscardedSet, direction) {
    if (direction === StackDirection_1.StackDirection.Undecided) {
        const upSet = reversibleGetRanksUsefulForMaxScore(lastPlayed, allDiscardedSet, StackDirection_1.StackDirection.Up);
        const downSet = reversibleGetRanksUsefulForMaxScore(lastPlayed, allDiscardedSet, StackDirection_1.StackDirection.Down);
        return new Set([...upSet, ...downSet]);
    }
    const ranksSet = new Set();
    if (direction === StackDirection_1.StackDirection.Finished) {
        return ranksSet;
    }
    if (direction === StackDirection_1.StackDirection.Up) {
        // We first deal with S and 1, if both are discarded then no other cards can be played:
        if (allDiscardedSet.has(constants_1.START_CARD_RANK) && allDiscardedSet.has(1)) {
            return ranksSet;
        }
        let nextToPlay = 2;
        if (lastPlayed === null) {
            ranksSet.add(1);
            ranksSet.add(constants_1.START_CARD_RANK);
        }
        else if (lastPlayed !== constants_1.START_CARD_RANK) {
            nextToPlay = lastPlayed + 1;
        }
        // Then we walk up from `nextToPlay` (at least 2 as we dealt with S and 1 already):
        for (let rank = nextToPlay; rank <= 5; rank++) {
            if (allDiscardedSet.has(rank)) {
                break;
            }
            else {
                ranksSet.add(rank);
            }
        }
    }
    // Same logic than Up, but reversed.
    if (direction === StackDirection_1.StackDirection.Down) {
        if (allDiscardedSet.has(constants_1.START_CARD_RANK) && allDiscardedSet.has(5)) {
            return ranksSet;
        }
        let nextToPlay = 4;
        if (lastPlayed === null) {
            ranksSet.add(5);
            ranksSet.add(constants_1.START_CARD_RANK);
        }
        else if (lastPlayed !== constants_1.START_CARD_RANK) {
            nextToPlay = lastPlayed - 1;
        }
        for (let rank = nextToPlay; rank >= 1; rank--) {
            if (allDiscardedSet.has(rank)) {
                break;
            }
            else {
                ranksSet.add(rank);
            }
        }
    }
    return ranksSet;
}
/**
 * Calculates what the maximum score is, accounting for stacks that cannot be completed due to
 * discarded cards.
 *
 * This function mirrors the server function "variantReversibleGetMaxScore()", except that it
 * creates a per stack array, instead.
 */
function reversibleGetMaxScorePerStack(deck, playStackDirections, variant) {
    const maxScorePerStack = (0, complete_common_1.newArray)(variant.suits.length, 0);
    for (const i of variant.suits.keys()) {
        const suitIndex = i;
        const allDiscardedSet = (0, deck_1.getAllDiscardedSetForSuit)(variant, deck, suitIndex);
        const stackDirection = playStackDirections[suitIndex];
        if (stackDirection === undefined) {
            continue;
        }
        switch (stackDirection) {
            case StackDirection_1.StackDirection.Undecided: {
                const upWalk = walkUp(allDiscardedSet, variant);
                const downWalk = walkDown(allDiscardedSet, variant);
                maxScorePerStack[suitIndex] += Math.max(upWalk, downWalk);
                break;
            }
            case StackDirection_1.StackDirection.Up: {
                maxScorePerStack[suitIndex] += walkUp(allDiscardedSet, variant);
                break;
            }
            case StackDirection_1.StackDirection.Down: {
                maxScorePerStack[suitIndex] += walkDown(allDiscardedSet, variant);
                break;
            }
            case StackDirection_1.StackDirection.Finished: {
                maxScorePerStack[suitIndex] += variant.stackSize;
                break;
            }
        }
    }
    return maxScorePerStack;
}
/** A helper function for `getMaxScore`. */
function walkUp(allDiscardedSet, variant) {
    let cardsThatCanStillBePlayed = 0;
    // First, check to see if the stack can still be started.
    if (variant.upOrDown) {
        // In "Up or Down" variants, you can start with 1 or START when going up.
        if (allDiscardedSet.has(1) && allDiscardedSet.has(constants_1.START_CARD_RANK)) {
            return 0;
        }
    }
    else if (allDiscardedSet.has(1)) {
        // Otherwise, only 1.
        return 0;
    }
    cardsThatCanStillBePlayed++;
    // Second, walk upwards.
    for (const rank of (0, complete_common_1.iRange)(2, 5)) {
        if (allDiscardedSet.has(rank)) {
            break;
        }
        cardsThatCanStillBePlayed++;
    }
    return cardsThatCanStillBePlayed;
}
/** A helper function for `getMaxScore`. */
function walkDown(allDiscardedSet, variant) {
    let cardsThatCanStillBePlayed = 0;
    // First, check to see if the stack can still be started.
    if (variant.upOrDown) {
        if (allDiscardedSet.has(5) && allDiscardedSet.has(constants_1.START_CARD_RANK)) {
            // In "Up or Down" variants, you can start with 5 or START when going down.
            return 0;
        }
    }
    else if (allDiscardedSet.has(5)) {
        // Otherwise, only 5.
        return 0;
    }
    cardsThatCanStillBePlayed++;
    // Second, walk downwards.
    for (let rank = 4; rank >= 1; rank--) {
        if (allDiscardedSet.has(rank)) {
            break;
        }
        cardsThatCanStillBePlayed++;
    }
    return cardsThatCanStillBePlayed;
}
/** This does not mirror any function on the server. */
function reversibleIsCardCritical(suitIndex, rank, deck, playStackDirections, variant) {
    const { isLastCopy, isAllDiscarded } = (0, deck_1.getDiscardHelpers)(variant, deck);
    const lastCopy = isLastCopy(suitIndex, rank);
    if (!variant.upOrDown) {
        return lastCopy;
    }
    if (!lastCopy) {
        // There are more copies of this card.
        return false;
    }
    const direction = playStackDirections[suitIndex];
    // The START, 1's and 5's are critical if all copies of either of the other two cards are
    // discarded in an Undecided direction.
    if ((rank === 1 || rank === 5 || rank === constants_1.START_CARD_RANK)
        && direction === StackDirection_1.StackDirection.Undecided) {
        return (isAllDiscarded(suitIndex, constants_1.START_CARD_RANK)
            || isAllDiscarded(suitIndex, 1)
            || isAllDiscarded(suitIndex, 5));
    }
    // 1's and 5's are critical to end if the direction requires them in the end.
    if (rank === 1) {
        return direction === StackDirection_1.StackDirection.Down;
    }
    if (rank === 5) {
        return direction === StackDirection_1.StackDirection.Up;
    }
    // The default case is all other ranks.
    return true;
}
//# sourceMappingURL=reversible.js.map