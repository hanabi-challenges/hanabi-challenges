"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cardOrder = void 0;
const zod_1 = require("zod");
exports.cardOrder = zod_1.z.number().int().min(0).max(65).brand("CardOrder");
//# sourceMappingURL=CardOrder.js.map