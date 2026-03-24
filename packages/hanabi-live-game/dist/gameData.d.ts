import type { Character } from "./interfaces/Character";
import type { Suit } from "./interfaces/Suit";
import type { Variant } from "./interfaces/Variant";
/** Indexed by color name. */
export declare const COLORS_MAP: ReadonlyMap<string, import(".").Color>;
/** Indexed by suit name. */
export declare const SUITS_MAP: ReadonlyMap<string, Suit>;
export declare const VARIANT_NAMES: readonly string[];
export declare function getSuit(suitName: string): Suit;
export declare function getVariant(variantName: string): Variant;
export declare function getVariantByID(variantID: number): Variant;
export declare function getDefaultVariant(): Variant;
export declare function doesVariantExist(variantName: string): boolean;
export declare function getCharacter(characterID: number): Character;
//# sourceMappingURL=gameData.d.ts.map