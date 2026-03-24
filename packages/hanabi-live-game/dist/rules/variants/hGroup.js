"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isHardVariant = isHardVariant;
const variantIdentity_1 = require("./variantIdentity");
const HARD_VARIANT_EFFICIENCY_THRESHOLD = 1.33;
// The H-Group makes a distinction between a "Hard Variant" and an "Easy Variant":
// https://hanabi.github.io/variant-specific/#hard-variants--easy-variants
function isHardVariant(variant, minEfficiency) {
    // Some variants are defined as always being hard, regardless of what the efficiency is.
    if ((0, variantIdentity_1.isColorMute)(variant)
        || (0, variantIdentity_1.isNumberMute)(variant)
        || variant.throwItInAHole
        || variant.cowAndPig
        || variant.duck
        || variant.upOrDown) {
        return true;
    }
    return minEfficiency >= HARD_VARIANT_EFFICIENCY_THRESHOLD;
}
//# sourceMappingURL=hGroup.js.map