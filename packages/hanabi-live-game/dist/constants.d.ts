export declare const START_CARD_RANK = 7;
export declare const MAX_CLUE_NUM = 8;
export declare const MAX_STRIKES = 3;
export declare const DEFAULT_VARIANT_NAME = "No Variant";
export declare const DEFAULT_CARD_RANKS: readonly [1, 2, 3, 4, 5];
export declare const ALL_CARD_RANKS: readonly [1, 2, 3, 4, 5, 7];
export declare const DEFAULT_CLUE_RANKS: readonly [1, 2, 3, 4, 5];
/**
 * The amount of cards that need to be played on a play stack in order for it to be considered
 * finished. In a no variant game, this is 5 because we need to play 1, 2, 3, 4, and 5.
 */
export declare const DEFAULT_FINISHED_STACK_LENGTH = 5;
export declare const MIN_PLAYERS = 2;
export declare const MAX_PLAYERS = 6;
/** The valid amount of players that can be in a game. */
export declare const VALID_NUM_PLAYERS: readonly [2, 3, 4, 5, 6];
export declare const VALID_PLAYER_INDEXES: readonly [0, 1, 2, 3, 4, 5];
export declare const MAX_SUITS_IN_A_VARIANT = 6;
export declare const VALID_SUIT_INDEXES: readonly [0, 1, 2, 3, 4, 5];
/** A variant can never have more colors than suits, so we repurpose the existing array. */
export declare const VALID_CLUE_COLOR_INDEXES: readonly [0, 1, 2, 3, 4, 5];
export declare const MAX_CARDS_IN_A_DECK: number;
export declare const DEFAULT_PLAYER_NAMES: readonly ["Alice", "Bob", "Cathy", "Donald", "Emily", "Frank"];
export declare const SUIT_REVERSED_SUFFIX = " Reversed";
export declare const SUIT_DELIMITER = "+";
export declare const SUIT_MODIFIER_DELIMITER = ":";
export declare const REVERSE_MODIFIER = "R";
export declare const SUIT_MODIFIERS: ReadonlySet<string>;
export declare const VARIANT_DELIMITER = ",";
//# sourceMappingURL=constants.d.ts.map