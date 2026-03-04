// frontend/src/design-system/primitives/tokens/textScale.ts
export const textScale = {
  1: { fontSize: '8px', lineHeight: 1.2 },
  2: { fontSize: '10px', lineHeight: 1.2 },
  3: { fontSize: '12px', lineHeight: 1.2 },

  4: { fontSize: '14px', lineHeight: 1.4 },
  5: { fontSize: '16px', lineHeight: 1.4 },
  6: { fontSize: '18px', lineHeight: 1.4 },
  7: { fontSize: '20px', lineHeight: 1.4 },

  8: { fontSize: '24px', lineHeight: 1.2 },
  9: { fontSize: '28px', lineHeight: 1.2 },
  10: { fontSize: '34px', lineHeight: 1.2 },
  11: { fontSize: '40px', lineHeight: 1.2 },
} as const;

export type TextScale = typeof textScale;
