"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.charactersInit = charactersInit;
const tslib_1 = require("tslib");
const characters_json_1 = tslib_1.__importDefault(require("./json/characters.json"));
function charactersInit() {
    const characters = new Map();
    if (characters_json_1.default.length === 0) {
        throw new Error('The "characters.json" file did not have any elements in it.');
    }
    for (const character of characters_json_1.default) {
        // Validate the name
        if (character.name === "") {
            throw new Error('There is a character with an empty name in the "characters.json" file.');
        }
        // Validate the ID. (The first character has an ID of 0.)
        if (character.id < 0) {
            throw new Error(`The "${character.name}" character has an invalid ID.`);
        }
        // Validate the description
        if (character.description === "") {
            throw new Error(`The "${character.name}" character does not have a description.`);
        }
        // Validate the emoji
        if (character.emoji === "") {
            throw new Error(`The "${character.name}" character does not have an emoji.`);
        }
        // Add it to the map.
        characters.set(character.id, character);
    }
    return characters;
}
//# sourceMappingURL=charactersInit.js.map