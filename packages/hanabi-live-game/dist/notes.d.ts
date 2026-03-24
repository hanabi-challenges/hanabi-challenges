import type { Suit } from "./interfaces/Suit";
/**
 * This function generates a regular expression that is used to detect "identity notes" (notes about
 * the possible identities of a card, such as `this is a [red 1]`).
 */
export declare function getIdentityNotePatternForVariant(suits: readonly Suit[], ranks: readonly number[], suitAbbreviations: readonly string[], isUpOrDown: boolean): string;
//# sourceMappingURL=notes.d.ts.map