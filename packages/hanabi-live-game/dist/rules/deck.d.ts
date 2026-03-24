import type { CardState } from "../interfaces/CardState";
import type { GameMetadata } from "../interfaces/GameMetadata";
import type { Suit } from "../interfaces/Suit";
import type { Variant } from "../interfaces/Variant";
import type { Rank } from "../types/Rank";
import type { SuitIndex } from "../types/SuitIndex";
export declare function getTotalCardsInDeck(variant: Variant): number;
/**
 * Returns how many copies of this card should exist in the deck.
 *
 * This implementation mirrors `numCopiesOfCard` in "server/src/game_deck.go".
 */
export declare function getNumCopiesOfCard(suit: Suit, rank: Rank, variant: Variant): number;
/** Returns how many cards of a specific suit/rank that have been already discarded. */
export declare function getNumDiscardedCopiesOfCard(deck: readonly CardState[], suitIndex: SuitIndex, rank: Rank): number;
export declare function isInitialDealFinished(currentDeckSize: number, metadata: GameMetadata): boolean;
export declare function getDiscardHelpers(variant: Variant, deck: readonly CardState[]): {
    isLastCopy: (suitIndex: SuitIndex, rank: Rank) => boolean;
    isAllDiscarded: (suitIndex: SuitIndex, rank: Rank) => boolean;
};
export declare function getAllDiscardedSetForSuit(variant: Variant, deck: readonly CardState[], suitIndex: SuitIndex): ReadonlySet<Rank>;
//# sourceMappingURL=deck.d.ts.map