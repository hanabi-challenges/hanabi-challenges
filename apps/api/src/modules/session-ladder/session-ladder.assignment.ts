export function shuffleInPlace<T>(arr: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  for (let i = arr.length - 1; i > 0; i -= 1) {
    h ^= h << 13;
    h ^= h >> 17;
    h ^= h << 5;
    const j = Math.abs(h) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function partitionHybrid34(count: number): number[] {
  if (count < 3) return [];
  let best: number[] = [];
  let bestAssigned = 0;

  for (let teamsOf4 = 0; teamsOf4 * 4 <= count; teamsOf4 += 1) {
    const remaining = count - teamsOf4 * 4;
    const teamsOf3 = Math.floor(remaining / 3);
    const assigned = teamsOf4 * 4 + teamsOf3 * 3;
    const candidate = [...Array(teamsOf3).fill(3), ...Array(teamsOf4).fill(4)];
    if (assigned > bestAssigned) {
      bestAssigned = assigned;
      best = candidate;
      continue;
    }
    if (assigned === bestAssigned) {
      const candThreeCount = candidate.filter((n) => n === 3).length;
      const bestThreeCount = best.filter((n) => n === 3).length;
      if (candThreeCount > bestThreeCount) {
        best = candidate;
      }
    }
  }

  return best;
}
