"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VARIANT_DELIMITER = exports.SUIT_MODIFIERS = exports.REVERSE_MODIFIER = exports.SUIT_MODIFIER_DELIMITER = exports.SUIT_DELIMITER = exports.SUIT_REVERSED_SUFFIX = exports.DEFAULT_PLAYER_NAMES = exports.MAX_CARDS_IN_A_DECK = exports.VALID_CLUE_COLOR_INDEXES = exports.VALID_SUIT_INDEXES = exports.MAX_SUITS_IN_A_VARIANT = exports.VALID_PLAYER_INDEXES = exports.VALID_NUM_PLAYERS = exports.MAX_PLAYERS = exports.MIN_PLAYERS = exports.DEFAULT_FINISHED_STACK_LENGTH = exports.DEFAULT_CLUE_RANKS = exports.ALL_CARD_RANKS = exports.DEFAULT_CARD_RANKS = exports.DEFAULT_VARIANT_NAME = exports.MAX_STRIKES = exports.MAX_CLUE_NUM = exports.START_CARD_RANK = void 0;
const complete_common_1 = require("complete-common");
exports.START_CARD_RANK = 7;
exports.MAX_CLUE_NUM = 8;
exports.MAX_STRIKES = 3;
exports.DEFAULT_VARIANT_NAME = "No Variant";
exports.DEFAULT_CARD_RANKS = [1, 2, 3, 4, 5];
exports.ALL_CARD_RANKS = [...exports.DEFAULT_CARD_RANKS, exports.START_CARD_RANK];
exports.DEFAULT_CLUE_RANKS = [1, 2, 3, 4, 5];
/**
 * The amount of cards that need to be played on a play stack in order for it to be considered
 * finished. In a no variant game, this is 5 because we need to play 1, 2, 3, 4, and 5.
 */
exports.DEFAULT_FINISHED_STACK_LENGTH = 5;
exports.MIN_PLAYERS = 2;
exports.MAX_PLAYERS = 6;
/** The valid amount of players that can be in a game. */
exports.VALID_NUM_PLAYERS = [2, 3, 4, 5, 6];
exports.VALID_PLAYER_INDEXES = [0, 1, 2, 3, 4, 5];
exports.MAX_SUITS_IN_A_VARIANT = 6;
exports.VALID_SUIT_INDEXES = [0, 1, 2, 3, 4, 5];
/** A variant can never have more colors than suits, so we repurpose the existing array. */
exports.VALID_CLUE_COLOR_INDEXES = exports.VALID_SUIT_INDEXES;
const MAX_CARDS_IN_A_SUIT = 10;
exports.MAX_CARDS_IN_A_DECK = MAX_CARDS_IN_A_SUIT * exports.MAX_SUITS_IN_A_VARIANT;
exports.DEFAULT_PLAYER_NAMES = [
    "Alice",
    "Bob",
    "Cathy",
    "Donald",
    "Emily",
    "Frank",
];
exports.SUIT_REVERSED_SUFFIX = " Reversed";
exports.SUIT_DELIMITER = "+";
exports.SUIT_MODIFIER_DELIMITER = ":";
exports.REVERSE_MODIFIER = "R";
exports.SUIT_MODIFIERS = new complete_common_1.ReadonlySet(exports.REVERSE_MODIFIER);
exports.VARIANT_DELIMITER = ",";
//# sourceMappingURL=constants.js.map