import { CardStatus } from "../enums/CardStatus";
import type { CardState } from "../interfaces/CardState";
import type { GameState } from "../interfaces/GameState";
import type { Variant } from "../interfaces/Variant";
import type { Rank } from "../types/Rank";
import type { SuitIndex } from "../types/SuitIndex";
export declare function getCardName(suitIndex: SuitIndex, rank: Rank, variant: Variant): string;
/**
 * Returns true if the card is not yet played and is still needed to be played in order to get the
 * maximum score. This mirrors the server function "Card.NeedsToBePlayed()".
 */
export declare function isCardNeededForMaxScore(suitIndex: SuitIndex | -1, rank: Rank | -1, deck: readonly CardState[], playStacks: GameState["playStacks"], playStackDirections: GameState["playStackDirections"], playStackStarts: GameState["playStackStarts"], variant: Variant): boolean;
export declare function getCardStatus(suitIndex: SuitIndex, rank: Rank, deck: readonly CardState[], playStacks: GameState["playStacks"], playStackDirections: GameState["playStackDirections"], playStackStarts: GameState["playStackStarts"], variant: Variant): CardStatus;
/** This does not mirror any function on the server. */
export declare function isCardCritical(suitIndex: SuitIndex | -1, rank: Rank | -1, deck: readonly CardState[], playStackDirections: GameState["playStackDirections"], variant: Variant): boolean;
export declare function isCardPotentiallyPlayable(card: CardState, deck: readonly CardState[], playStacks: GameState["playStacks"], playStackDirections: GameState["playStackDirections"], playStackStarts: GameState["playStackStarts"], variant: Variant): boolean;
export declare function canCardPossiblyBeFromCluesOnly(card: CardState, suitIndex: SuitIndex | null, rank: Rank | null): boolean;
export declare function canCardPossiblyBeFromEmpathy(card: CardState, suitIndex: SuitIndex | null, rank: Rank | null): boolean;
export declare function isAllCardPossibilitiesTrash(card: CardState, deck: readonly CardState[], playStacks: GameState["playStacks"], playStackDirections: GameState["playStackDirections"], playStackStarts: GameState["playStackStarts"], variant: Variant, empathy: boolean): boolean;
//# sourceMappingURL=card.d.ts.map