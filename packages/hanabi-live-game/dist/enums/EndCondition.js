"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EndCondition = void 0;
/** Corresponds to values in the database. If changed, the database must also be updated. */
var EndCondition;
(function (EndCondition) {
    EndCondition[EndCondition["InProgress"] = 0] = "InProgress";
    EndCondition[EndCondition["Normal"] = 1] = "Normal";
    EndCondition[EndCondition["Strikeout"] = 2] = "Strikeout";
    EndCondition[EndCondition["Timeout"] = 3] = "Timeout";
    EndCondition[EndCondition["TerminatedByPlayer"] = 4] = "TerminatedByPlayer";
    EndCondition[EndCondition["SpeedrunFail"] = 5] = "SpeedrunFail";
    EndCondition[EndCondition["IdleTimeout"] = 6] = "IdleTimeout";
    EndCondition[EndCondition["CharacterSoftlock"] = 7] = "CharacterSoftlock";
    EndCondition[EndCondition["AllOrNothingFail"] = 8] = "AllOrNothingFail";
    EndCondition[EndCondition["AllOrNothingSoftlock"] = 9] = "AllOrNothingSoftlock";
    EndCondition[EndCondition["TerminatedByVote"] = 10] = "TerminatedByVote";
})(EndCondition || (exports.EndCondition = EndCondition = {}));
//# sourceMappingURL=EndCondition.js.map