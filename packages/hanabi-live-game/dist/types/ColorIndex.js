"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.colorIndex = void 0;
const zod_1 = require("zod");
const constants_1 = require("../constants");
exports.colorIndex = zod_1.z.custom((data) => constants_1.VALID_CLUE_COLOR_INDEXES.includes(data));
//# sourceMappingURL=ColorIndex.js.map