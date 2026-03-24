import type { Color } from "./interfaces/Color";
import type { Suit } from "./interfaces/Suit";
import type { Variant } from "./interfaces/Variant";
import type { VariantDescription } from "./interfaces/VariantDescription";
export declare function variantsInit(colorsMap: ReadonlyMap<string, Color>, suitsMap: ReadonlyMap<string, Suit>): ReadonlyMap<string, Variant>;
export declare function createVariant(colorsMap: ReadonlyMap<string, Color>, suitsMap: ReadonlyMap<string, Suit>, variantDescription: VariantDescription, id: number, newID: string): Variant;
//# sourceMappingURL=variantsInit.d.ts.map