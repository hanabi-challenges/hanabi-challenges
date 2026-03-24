import { useEffect, useState } from 'react';
import { getJson } from '../lib/api';

export type HanabiVariant = {
  code: number;
  name: string;
  label: string;
  num_suits: number;
  is_sudoku: boolean;
};

type State = {
  variants: HanabiVariant[];
  loading: boolean;
  error: string | null;
};

let cache: HanabiVariant[] | null = null;

export function useVariants(): State {
  const [state, setState] = useState<State>({
    variants: cache ?? [],
    loading: cache === null,
    error: null,
  });

  useEffect(() => {
    if (cache !== null) return;
    let cancelled = false;

    getJson<{ variants: HanabiVariant[] }>('/variants')
      .then((data) => {
        if (cancelled) return;
        cache = data.variants;
        setState({ variants: data.variants, loading: false, error: null });
      })
      .catch(() => {
        if (!cancelled)
          setState((s) => ({ ...s, loading: false, error: 'Failed to load variants.' }));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export function variantSelectOptions(
  variants: HanabiVariant[],
): { value: string; label: string }[] {
  return [
    { value: '', label: 'None' },
    ...variants.map((v) => ({ value: String(v.code), label: `${v.name}` })),
  ];
}
