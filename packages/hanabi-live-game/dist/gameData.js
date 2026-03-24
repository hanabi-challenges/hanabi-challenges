"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VARIANT_NAMES = exports.SUITS_MAP = exports.COLORS_MAP = void 0;
exports.getSuit = getSuit;
exports.getVariant = getVariant;
exports.getVariantByID = getVariantByID;
exports.getDefaultVariant = getDefaultVariant;
exports.doesVariantExist = doesVariantExist;
exports.getCharacter = getCharacter;
const complete_common_1 = require("complete-common");
const charactersInit_1 = require("./charactersInit");
const colorsInit_1 = require("./colorsInit");
const constants_1 = require("./constants");
const suitsInit_1 = require("./suitsInit");
const variantsInit_1 = require("./variantsInit");
/** Indexed by character ID. */
const CHARACTERS_MAP = (0, charactersInit_1.charactersInit)();
/** Indexed by color name. */
exports.COLORS_MAP = (0, colorsInit_1.colorsInit)();
/** Indexed by suit name. */
exports.SUITS_MAP = (0, suitsInit_1.suitsInit)(exports.COLORS_MAP);
const VARIANTS_MAP_BY_NAME = (0, variantsInit_1.variantsInit)(exports.COLORS_MAP, exports.SUITS_MAP);
exports.VARIANT_NAMES = [...VARIANTS_MAP_BY_NAME.keys()];
const VARIANTS_MAP_BY_ID = (() => {
    const variantsMapByID = new Map();
    for (const variant of VARIANTS_MAP_BY_NAME.values()) {
        variantsMapByID.set(variant.id, variant);
    }
    return variantsMapByID;
})();
function getSuit(suitName) {
    const suit = exports.SUITS_MAP.get(suitName);
    (0, complete_common_1.assertDefined)(suit, `Failed to find the "${suitName}" suit in the "SUITS" map.`);
    return suit;
}
function getVariant(variantName) {
    const variant = VARIANTS_MAP_BY_NAME.get(variantName);
    (0, complete_common_1.assertDefined)(variant, `Failed to find the "${variantName}" variant in the "VARIANTS" map.`);
    return variant;
}
function getVariantByID(variantID) {
    const variant = VARIANTS_MAP_BY_ID.get(variantID);
    (0, complete_common_1.assertDefined)(variant, `Failed to find the "${variantID}" variant in the "VARIANTS_BY_ID" map.`);
    return variant;
}
function getDefaultVariant() {
    return getVariant(constants_1.DEFAULT_VARIANT_NAME);
}
function doesVariantExist(variantName) {
    return VARIANTS_MAP_BY_NAME.has(variantName);
}
function getCharacter(characterID) {
    const character = CHARACTERS_MAP.get(characterID);
    (0, complete_common_1.assertDefined)(character, `Failed to find the character corresponding to ID ${characterID} in the "CHARACTERS" map.`);
    return character;
}
//# sourceMappingURL=gameData.js.map