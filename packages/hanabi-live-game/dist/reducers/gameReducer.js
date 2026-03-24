"use strict";
// Functions for building a game state for every turn.
Object.defineProperty(exports, "__esModule", { value: true });
exports.gameReducer = void 0;
/* eslint-disable no-param-reassign */
/* eslint-disable unicorn/no-null */
const complete_common_1 = require("complete-common");
const immer_1 = require("immer");
const ClueType_1 = require("../enums/ClueType");
const EndCondition_1 = require("../enums/EndCondition");
const gameData_1 = require("../gameData");
const card_1 = require("../rules/card");
const cardState_1 = require("../rules/cardState");
const clueTokens_1 = require("../rules/clueTokens");
const deck_1 = require("../rules/deck");
const hand_1 = require("../rules/hand");
const playStacks_1 = require("../rules/playStacks");
const text_1 = require("../rules/text");
const variantIdentity_1 = require("../rules/variants/variantIdentity");
const cardsReducer_1 = require("./cardsReducer");
const ddaReducer_1 = require("./ddaReducer");
const knownTrashReducer_1 = require("./knownTrashReducer");
const statsReducer_1 = require("./statsReducer");
const turnReducer_1 = require("./turnReducer");
/** Computes the next game state from a given action. */
exports.gameReducer = (0, immer_1.produce)(gameReducerFunction, {});
function gameReducerFunction(gameState, action, playing, shadowing, finished, hypothetical, metadata, ourNotes) {
    const variant = (0, gameData_1.getVariant)(metadata.options.variantName);
    switch (action.type) {
        /**
         * A player just gave a clue:
         *
         * ```ts
         * {
         *   type: "clue",
         *   clue: { type: 0, value: 1 },
         *   giver: 1,
         *   list: [11],
         *   target: 2,
         *   turn: 0,
         * }
         * ```
         */
        case "clue": {
            gameState.clueTokens -= (0, clueTokens_1.getAdjustedClueTokens)(1, variant);
            (0, complete_common_1.assertNotNull)(gameState.turn.segment, `A "${action.type}" action happened before all of the initial cards were dealt.`);
            const targetHand = gameState.hands[action.target];
            (0, complete_common_1.assertDefined)(targetHand, `Failed to find the hand at index: ${action.target}`);
            const negativeList = action.ignoreNegative
                ? []
                : targetHand.filter((i) => !action.list.includes(i));
            // Even though the objects for each clue type are the exact same, a switch statement is needed
            // to satisfy the TypeScript compiler.
            switch (action.clue.type) {
                case ClueType_1.ClueType.Color: {
                    const clue = (0, immer_1.castDraft)({
                        type: action.clue.type,
                        value: action.clue.value,
                        giver: action.giver,
                        target: action.target,
                        segment: gameState.turn.segment,
                        list: action.list,
                        negativeList,
                    });
                    gameState.clues.push(clue);
                    break;
                }
                case ClueType_1.ClueType.Rank: {
                    const clue = (0, immer_1.castDraft)({
                        type: action.clue.type,
                        value: action.clue.value,
                        giver: action.giver,
                        target: action.target,
                        segment: gameState.turn.segment,
                        list: action.list,
                        negativeList,
                    });
                    gameState.clues.push(clue);
                    break;
                }
            }
            const text = (0, text_1.getClueText)(action, targetHand, hypothetical, metadata);
            gameState.log.push({
                turn: gameState.turn.turnNum + 1,
                text,
            });
            // Handle the "Card Cycling" game option.
            const giverHand = gameState.hands[action.giver];
            (0, complete_common_1.assertDefined)(giverHand, `Failed to find the hand at index: ${action.giver}`);
            cardCycle(giverHand, (0, immer_1.castDraft)(gameState.deck), metadata);
            break;
        }
        /**
         * A player just discarded a card.
         *
         * ```ts
         * {
         *   type: "discard",
         *   playerIndex: 0,
         *   order: 4,
         *   suitIndex: 2,
         *   rank: 1,
         *   failed: false,
         * }
         * ```
         */
        case "discard": {
            // Remove it from the hand.
            const hand = gameState.hands[action.playerIndex];
            (0, complete_common_1.assertDefined)(hand, `Failed to find the hand at index: ${action.playerIndex}`);
            const handIndex = hand.indexOf(action.order);
            let slot = null;
            if (handIndex !== -1) {
                // It is possible for players to misplay the deck.
                slot = hand.length - handIndex;
                hand.splice(handIndex, 1);
            }
            if (!throwItInAHolePlayedOrMisplayed(gameState, action, variant, playing, shadowing, finished)) {
                if (action.suitIndex === -1) {
                    throw new Error(`The suit index for a discarded card was: ${action.suitIndex}`);
                }
                // Add it to the discard stacks.
                const discardStack = gameState.discardStacks[action.suitIndex];
                (0, complete_common_1.assertDefined)(discardStack, `Failed to find the discard stack at index: ${action.suitIndex}`);
                discardStack.push(action.order);
                // Discarding cards grants clue tokens under certain circumstances.
                gameState.clueTokens = (0, clueTokens_1.getNewClueTokensAfterAction)(action, gameState.clueTokens, variant);
            }
            const cardState = gameState.deck[action.order];
            (0, complete_common_1.assertDefined)(cardState, `Failed to find the card state at order: ${action.order}`);
            const touched = (0, cardState_1.isCardClued)(cardState);
            // We do not want include the "(critical)" text for dead suits.
            const critical = (0, card_1.isCardCritical)(action.suitIndex, action.rank, gameState.deck, gameState.playStackDirections, variant)
                && (0, card_1.isCardNeededForMaxScore)(action.suitIndex, action.rank, gameState.deck, gameState.playStacks, gameState.playStackDirections, gameState.playStackStarts, variant);
            const text = (0, text_1.getDiscardText)(action, slot, touched, critical, playing, shadowing, hypothetical, metadata);
            gameState.log.push({
                turn: gameState.turn.turnNum + 1,
                text,
            });
            break;
        }
        /**
         * A player just drew a card from the deck.
         *
         * ```ts
         * {
         *   type: "draw",
         *   playerIndex: 0,
         *   order: 0,
         *   rank: 1,
         *   suitIndex: 4,
         * }
         * ```
         */
        case "draw": {
            gameState.cardsRemainingInTheDeck--;
            const hand = gameState.hands[action.playerIndex];
            if (hand !== undefined) {
                hand.push(action.order);
            }
            if ((0, deck_1.isInitialDealFinished)(gameState.cardsRemainingInTheDeck, metadata)) {
                const text = (0, text_1.getGoesFirstText)(gameState.turn.currentPlayerIndex, metadata.playerNames);
                gameState.log.push({
                    turn: gameState.turn.turnNum + 1,
                    text,
                });
            }
            break;
        }
        /**
         * The game has ended, either by normal means (e.g. max score), or someone ran out of time in a
         * timed game, someone terminated, etc.
         *
         * ```ts
         * {
         *   type: "gameOver",
         *   endCondition: 1,
         *   playerIndex: 0,
         * }
         * ```ts
         */
        case "gameOver": {
            if (action.endCondition !== EndCondition_1.EndCondition.Normal) {
                gameState.score = 0;
            }
            const text = (0, text_1.getGameOverText)(action.endCondition, action.playerIndex, gameState.score, metadata, action.votes);
            gameState.log.push({
                turn: gameState.turn.turnNum + 1,
                text,
            });
            break;
        }
        /**
         * A player just played a card.
         *
         * ```ts
         * {
         *   type: "play",
         *   playerIndex: 0,
         *   order: 4,
         *   suitIndex: 2,
         *   rank: 1,
         * }
         * ```
         */
        case "play": {
            // Remove it from the hand.
            const hand = gameState.hands[action.playerIndex];
            (0, complete_common_1.assertDefined)(hand, `Failed to find the hand at index: ${action.playerIndex}`);
            const handIndex = hand.indexOf(action.order);
            let slot = null;
            if (handIndex !== -1) {
                slot = hand.length - handIndex;
                hand.splice(handIndex, 1);
            }
            // Add it to the play stacks.
            if (!throwItInAHolePlayedOrMisplayed(gameState, action, variant, playing, shadowing, finished)) {
                if (action.suitIndex === -1) {
                    throw new Error(`The suit index for a played card was: ${action.suitIndex}`);
                }
                const playStack = gameState.playStacks[action.suitIndex];
                (0, complete_common_1.assertDefined)(playStack, `Failed to find the play stack at index: ${action.suitIndex}`);
                playStack.push(action.order);
                // Playing cards grants clue tokens under certain circumstances.
                gameState.clueTokens = (0, clueTokens_1.getNewClueTokensAfterAction)(action, gameState.clueTokens, variant, playStack.length === variant.stackSize);
            }
            // Gain a point.
            gameState.score++;
            const cardState = gameState.deck[action.order];
            (0, complete_common_1.assertDefined)(cardState, `Failed to find the card state at order: ${action.order}`);
            const touched = (0, cardState_1.isCardClued)(cardState);
            const text = (0, text_1.getPlayText)(action, slot, touched, playing, shadowing, hypothetical, metadata);
            gameState.log.push({
                turn: gameState.turn.turnNum + 1,
                text,
            });
            break;
        }
        case "playerTimes": {
            for (const [playerIndex, playerTime] of (0, complete_common_1.tupleEntries)(action.playerTimes)) {
                // Player times are negative in untimed games.
                const modifier = metadata.options.timed ? 1 : -1;
                const milliseconds = playerTime * modifier;
                const durationString = (0, text_1.millisecondsToClockString)(milliseconds);
                const playerName = (0, text_1.getPlayerName)(playerIndex, metadata);
                const text = metadata.options.timed
                    ? `${playerName} had ${durationString} left`
                    : `${playerName} took: ${durationString}`;
                gameState.log.push({
                    turn: gameState.turn.turnNum + 1,
                    text,
                });
            }
            const clockString = (0, text_1.millisecondsToClockString)(action.duration);
            const text = `The total game duration was: ${clockString}`;
            gameState.log.push({
                turn: gameState.turn.turnNum + 1,
                text,
            });
            break;
        }
        /**
         * A player failed to play a card.
         *
         * ```ts
         * {
         *   type: "strike",
         *   num: 1,
         *   turn: 32,
         *   order: 24,
         * }
         * ```
         */
        // TODO: This message is unnecessary and will be removed in a future version of the code
        case "strike": {
            // We intentionally do not validate the size of the strikes array because we allow more than 3
            // strikes in hypotheticals.
            gameState.strikes.push({
                order: action.order,
                segment: gameState.turn.segment ?? 1,
            });
            break;
        }
        // Some actions do not affect the main state or are handled by another reducer.
        case "setEffMod":
        case "editNote":
        case "noteList":
        case "noteListPlayer":
        case "receiveNote":
        case "turn":
        case "cardIdentity": {
            break;
        }
    }
    if (action.type === "noteList" || action.type === "receiveNote") {
        // This has no effect, so do not bother computing anything.
        return;
    }
    // Use a sub-reducer to calculate changes on cards.
    const originalDeck = (0, immer_1.original)(gameState.deck);
    (0, complete_common_1.assertDefined)(originalDeck, "Failed to find the original deck.");
    gameState.deck = (0, immer_1.castDraft)((0, cardsReducer_1.cardsReducer)(originalDeck, action, gameState, metadata));
    // Resolve the stack direction.
    if (action.type === "play"
        && ((0, variantIdentity_1.hasReversedSuits)(variant) || variant.sudoku)
        && action.suitIndex !== -1) {
        // We have to wait until the deck is updated with the information of the card that we played
        // before the `direction` function will work.
        const playStack = gameState.playStacks[action.suitIndex];
        (0, complete_common_1.assertDefined)(playStack, `Failed to find the play stack at index: ${action.suitIndex}`);
        const direction = (0, playStacks_1.getStackDirection)(action.suitIndex, playStack, gameState.deck, variant);
        gameState.playStackDirections[action.suitIndex] = direction;
    }
    // In Sudoku variants, resolve the stack starting value.
    if (action.type === "play" && variant.sudoku && action.suitIndex !== -1) {
        const playStack = gameState.playStacks[action.suitIndex];
        (0, complete_common_1.assertDefined)(playStack, `Failed to find the play stack at index: ${action.suitIndex}`);
        gameState.playStackStarts[action.suitIndex] = (0, playStacks_1.getStackStartRank)(playStack, gameState.deck);
    }
    // Discarding or playing cards can make other card cards in that suit not playable anymore and can
    // make other cards critical.
    if ((action.type === "play" || action.type === "discard")
        && action.suitIndex !== -1
        && action.rank !== -1) {
        for (const rank of variant.ranks) {
            gameState.cardStatus[action.suitIndex][rank] = (0, card_1.getCardStatus)(action.suitIndex, rank, gameState.deck, gameState.playStacks, gameState.playStackDirections, gameState.playStackStarts, variant);
        }
    }
    // Use a sub-reducer to calculate the turn.
    gameState.turn = (0, turnReducer_1.turnReducer)((0, immer_1.original)(gameState.turn), action, gameState, metadata);
    // Use a sub-reducer to calculate some game statistics.
    const originalState = (0, immer_1.original)(gameState);
    (0, complete_common_1.assertDefined)(originalState, "Failed to get the original state.");
    gameState.stats = (0, immer_1.castDraft)((0, statsReducer_1.statsReducer)((0, immer_1.original)(gameState.stats), action, originalState, gameState, playing, shadowing, metadata, ourNotes ?? null));
    // After stats calculated, compute DDA property on all card states.
    gameState.deck = (0, immer_1.castDraft)((0, ddaReducer_1.ddaReducer)(gameState.deck, gameState.stats.doubleDiscardCard, gameState.turn.currentPlayerIndex));
    // Finally, mark cards as known-trash.
    gameState.deck = (0, immer_1.castDraft)((0, knownTrashReducer_1.knownTrashReducer)(gameState.deck, gameState.playStacks, gameState.playStackDirections, gameState.playStackStarts, variant));
}
function cardCycle(
// eslint-disable-next-line complete/prefer-readonly-parameter-types
hand, deck, metadata) {
    if (!metadata.options.cardCycle) {
        return;
    }
    // We do not need to reorder anything if the chop is slot 1 (the left-most card).
    const chopIndex = (0, hand_1.getChopIndex)(hand, deck);
    if (chopIndex === hand.length - 1) {
        return;
    }
    // Remove the chop card from their hand.
    const newHand = hand.splice(chopIndex, 1);
    const removedCardOrder = newHand[0];
    if (removedCardOrder !== undefined) {
        // Add it to the end (the left-most position).
        hand.push(removedCardOrder);
    }
}
function throwItInAHolePlayedOrMisplayed(gameState, action, variant, playing, shadowing, finished) {
    if (!variant.throwItInAHole || (!playing && !shadowing) || finished) {
        return false;
    }
    if ((action.type === "discard" && action.failed) || action.type === "play") {
        // In "Throw It in a Hole" variants, plays and unknown misplayed cards go the hole instead of
        // the play stack / discard pile.
        gameState.hole.push(action.order);
        return true;
    }
    return false;
}
//# sourceMappingURL=gameReducer.js.map