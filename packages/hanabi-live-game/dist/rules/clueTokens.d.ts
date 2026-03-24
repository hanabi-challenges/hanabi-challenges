import type { Variant } from "../interfaces/Variant";
import type { ActionDiscard, ActionPlay } from "../types/gameActions";
/** Gain a clue by discarding or finishing a stack. */
export declare function getNewClueTokensAfterAction(action: ActionPlay | ActionDiscard, clueTokens: number, variant: Variant, playStackComplete?: boolean): number;
/**
 * In "Clue Starved" variants, each discard only grants 0.5 clue tokens. This is represented on the
 * client by discards granting 1 clue token and clues costing 2 tokens (to avoid having to use
 * floating point numbers).
 *
 * Thus, for a "Clue Starved" variant, if the unadjusted clue tokens were 2, the adjusted clue
 * tokens would be 4.
 */
export declare function getAdjustedClueTokens(clueTokens: number, variant: Variant): number;
/** See the documentation for the `getAdjustedClueTokens` function. */
export declare function getUnadjustedClueTokens(clueTokensAdjusted: number, variant: Variant): number;
export declare function isAtMaxClueTokens(clueTokens: number, variant: Variant): boolean;
/**
 * The value of clues gained when discarding. This function is only used in efficiency calculations
 * (because we do not want to use floating point numbers for the general case).
 *
 * In "Clue Starved" variants, each discard gives only half a clue.
 */
export declare function getDiscardClueTokenValue(variant: Variant): number;
/**
 * The value of clues gained when completing a suit. This function is only used in efficiency
 * calculations (because we do not want to use floating point numbers for the general case).
 */
export declare function getSuitCompleteClueTokenValue(variant: Variant): number;
//# sourceMappingURL=clueTokens.d.ts.map