import type { CardState } from "../interfaces/CardState";
import type { Options } from "../interfaces/Options";
import type { CardOrder } from "../types/CardOrder";
export declare function getCardsPerHand(options: Options): number;
/** For example, slot 1 is the newest (left-most) card, which is at index 4 (in a 3-player game). */
export declare function getCardSlot(order: CardOrder, hand: readonly number[]): number | undefined;
export declare function isHandLocked(hand: readonly number[], deck: readonly CardState[]): boolean;
export declare function getChopIndex(hand: readonly number[], deck: readonly CardState[]): number;
export declare function isCardOnChop(hand: readonly number[], deck: readonly CardState[], card: CardState): boolean;
//# sourceMappingURL=hand.d.ts.map