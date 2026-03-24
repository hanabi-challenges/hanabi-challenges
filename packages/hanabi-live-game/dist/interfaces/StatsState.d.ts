import type { Tuple } from "complete-common";
import type { PaceRisk } from "../enums/PaceRisk";
import type { CardOrder } from "../types/CardOrder";
import type { NumSuits } from "../types/NumSuits";
export interface StatsState {
    readonly maxScore: number;
    readonly maxScorePerStack: Readonly<Tuple<number, NumSuits>>;
    readonly pace: number | null;
    readonly paceRisk: PaceRisk;
    readonly finalRoundEffectivelyStarted: boolean;
    readonly cardsGotten: number;
    readonly potentialCluesLost: number;
    readonly cluesStillUsable: number | null;
    readonly cluesStillUsableNotRounded: number | null;
    readonly cardsGottenByNotes: number | null;
    /** Store the order of the double-discard candidate card, or null if not in DDA. */
    readonly doubleDiscardCard: CardOrder | null;
    readonly numSubsequentBlindPlays: number;
    readonly numSubsequentMisplays: number;
    /** For "Throw It in a Hole" variants. */
    readonly numAttemptedCardsPlayed: number;
}
//# sourceMappingURL=StatsState.d.ts.map