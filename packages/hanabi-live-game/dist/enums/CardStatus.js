"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CardStatus = void 0;
var CardStatus;
(function (CardStatus) {
    /**
     * Represents that the card needs to be played at some point in the future in order to get the
     * maximum score.
     */
    CardStatus[CardStatus["NeedsToBePlayed"] = 0] = "NeedsToBePlayed";
    /**
     * Represents that a card simultaneously needs to be played at some point in the future and is
     * critical (meaning that there is only one copy of this card left).
     */
    CardStatus[CardStatus["Critical"] = 1] = "Critical";
    /**
     * Represents that this card does not need to be played at some point in the future in order to
     * get the maximum score.
     */
    CardStatus[CardStatus["Trash"] = 2] = "Trash";
})(CardStatus || (exports.CardStatus = CardStatus = {}));
//# sourceMappingURL=CardStatus.js.map