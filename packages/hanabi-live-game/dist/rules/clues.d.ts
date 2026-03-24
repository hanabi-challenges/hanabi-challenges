import { ClueType } from "../enums/ClueType";
import type { Color } from "../interfaces/Color";
import type { GameMetadata } from "../interfaces/GameMetadata";
import type { Suit } from "../interfaces/Suit";
import type { Variant } from "../interfaces/Variant";
import type { Clue } from "../types/Clue";
import type { MsgClue } from "../types/MsgClue";
import type { PlayerIndex } from "../types/PlayerIndex";
import type { Rank } from "../types/Rank";
import type { RankClueNumber } from "../types/RankClueNumber";
import type { SuitIndex } from "../types/SuitIndex";
export declare function getClueName(clueType: ClueType, clueValue: number, variant: Variant, characterName: string): string;
/**
 * Convert a clue from the format used by the server to the format used by the client. On the
 * client, the color is a rich object. On the server, the color is a simple integer mapping.
 */
export declare function msgClueToClue(msgClue: MsgClue, variant: Variant): Clue;
/** This mirrors the function `variantIsCardTouched` in "variants.go". */
export declare function isCardTouchedByClue(variant: Variant, clue: Clue, cardSuitIndex: SuitIndex, cardRank: Rank): boolean;
export declare function isCardTouchedByClueColor(variant: Variant, clueColor: Color, cardSuit: Suit, cardRank: Rank): boolean;
/** The color that touches a prism card is contingent upon the card's rank. */
export declare function getColorForPrismCard(variant: Variant, rank: Rank): Color;
export declare function isCardTouchedByClueRank(variant: Variant, clueRank: RankClueNumber, cardSuitIndex: SuitIndex, cardSuit: Suit, cardRank: Rank): boolean;
export declare function shouldApplyClue(giverPlayerIndex: PlayerIndex, metadata: GameMetadata, variant: Variant): boolean;
//# sourceMappingURL=clues.d.ts.map