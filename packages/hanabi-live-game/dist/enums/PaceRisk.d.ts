/** A measure of how risky a discard would be right now, using different heuristics. */
export declare enum PaceRisk {
    /** The default state during the early game and mid-game. */
    Low = 0,
    /**
     * Formula derived by Hyphen-ated; a conservative estimate of "End-Game" that does not account for
     * the number of players.
     */
    Medium = 1,
    /**
     * Formula derived by Florrat; a strategical estimate of "End-Game" that tries to account for the
     * number of players.
     */
    High = 2,
    /**
     * Represents the current pace having a value of 0, meaning that no more discards can occur in
     * order to get a maximum score.
     */
    Zero = 3
}
//# sourceMappingURL=PaceRisk.d.ts.map