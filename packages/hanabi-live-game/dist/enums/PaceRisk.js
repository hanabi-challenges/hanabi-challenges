"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaceRisk = void 0;
/** A measure of how risky a discard would be right now, using different heuristics. */
var PaceRisk;
(function (PaceRisk) {
    /** The default state during the early game and mid-game. */
    PaceRisk[PaceRisk["Low"] = 0] = "Low";
    /**
     * Formula derived by Hyphen-ated; a conservative estimate of "End-Game" that does not account for
     * the number of players.
     */
    PaceRisk[PaceRisk["Medium"] = 1] = "Medium";
    /**
     * Formula derived by Florrat; a strategical estimate of "End-Game" that tries to account for the
     * number of players.
     */
    PaceRisk[PaceRisk["High"] = 2] = "High";
    /**
     * Represents the current pace having a value of 0, meaning that no more discards can occur in
     * order to get a maximum score.
     */
    PaceRisk[PaceRisk["Zero"] = 3] = "Zero";
})(PaceRisk || (exports.PaceRisk = PaceRisk = {}));
//# sourceMappingURL=PaceRisk.js.map