export const END_CONDITION_NAMES: Record<number, string> = {
  0: 'In Progress',
  1: 'Perfect',
  2: 'Strike Out',
  3: 'Time Out',
  4: 'Terminated By Player',
  5: 'Speedrun Fail',
  6: 'Idle Timeout',
  7: 'Character Softlock',
  8: 'All Or Nothing Fail',
  9: 'All Or Nothing Softlock',
  10: 'Terminated By Vote',
};

export const END_CONDITIONS_TURNS_VICTORY = new Set<number>([3, 4, 10]);

