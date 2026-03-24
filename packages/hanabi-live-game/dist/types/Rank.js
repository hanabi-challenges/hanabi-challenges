"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rank = void 0;
const zod_1 = require("zod");
const constants_1 = require("../constants");
exports.rank = zod_1.z.custom((data) => constants_1.ALL_CARD_RANKS.includes(data));
//# sourceMappingURL=Rank.js.map