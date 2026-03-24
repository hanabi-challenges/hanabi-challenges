import type { Suit } from "./interfaces/Suit";
import type { Variant } from "./interfaces/Variant";
export declare const KNOWN_TRASH_NOTES: readonly ["kt", "trash", "stale", "bad"];
export declare const QUESTION_MARK_NOTES: readonly ["?"];
export declare const EXCLAMATION_MARK_NOTES: readonly ["!"];
export declare const CHOP_MOVED_NOTES: readonly ["cm", "chop move", "chop moved", "5cm", "e5cm", "tcm", "tccm", "sdcm", "esdcm", "sbpcm", "ocm", "tocm", "mcm", "uutdcm", "uuddcm", "dtccm", "atcm", "ttcm"];
export declare const FINESSED_NOTES: readonly ["f", "hf", "sf", "cf", "pf", "gd"];
export declare const NEEDS_FIX_NOTES: readonly ["fix", "fixme", "needs fix"];
export declare const BLANK_NOTES: readonly ["blank", "unknown"];
export declare const CLUED_NOTES: readonly ["clued", "cl"];
export declare const UNCLUED_NOTES: readonly ["unclued", "x"];
/**
 * Contains only lowercase letters. Thus, when checking against the set, the input must also be
 * lowercase.
 */
export declare const ALL_RESERVED_NOTES: ReadonlySet<string>;
/**
 * Suit abbreviations are hard-coded in the "suits.json" file. In some variants, two or more suits
 * can have overlapping letter abbreviations. If this is the case, we dynamically find a new
 * abbreviation by using the left-most unused letter.
 *
 * Note that we cannot simply hard-code an alternate abbreviation in the "suits.json" file because
 * there are too many overlapping possibilities.
 */
export declare function getUppercaseSuitAbbreviationsForVariant(variantName: string, suits: readonly Suit[]): readonly string[];
/**
 * Given an existing variant, find the suit abbreviation for a suit. (Suit abbreviations are dynamic
 * and depend on the specific variant.)
 *
 * It is possible for this function to take in the "Unknown" suit, so we want to provide a fallback
 * without throwing an error.
 */
export declare function getSuitAbbreviationForVariant(suitToMatch: Suit, variant: Variant): string;
//# sourceMappingURL=abbreviations.d.ts.map