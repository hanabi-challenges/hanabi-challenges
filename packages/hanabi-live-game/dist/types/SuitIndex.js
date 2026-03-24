"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.suitIndex = void 0;
const zod_1 = require("zod");
const constants_1 = require("../constants");
exports.suitIndex = zod_1.z.custom((data) => constants_1.VALID_SUIT_INDEXES.includes(data));
//# sourceMappingURL=SuitIndex.js.map