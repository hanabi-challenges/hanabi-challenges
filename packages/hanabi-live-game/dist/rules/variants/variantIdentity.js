"use strict";
// Rules related to properties of variants.
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDualColor = isDualColor;
exports.isColorMute = isColorMute;
exports.isNumberMute = isNumberMute;
exports.hasReversedSuits = hasReversedSuits;
function isDualColor(variant) {
    return variant.suits.some((suit) => suit.clueColors.length >= 2);
}
function isColorMute(variant) {
    return variant.clueColors.length === 0;
}
function isNumberMute(variant) {
    return variant.clueRanks.length === 0;
}
function hasReversedSuits(variant) {
    return variant.upOrDown || variant.suits.some((suit) => suit.reversed);
}
//# sourceMappingURL=variantIdentity.js.map