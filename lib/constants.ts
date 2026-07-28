export const DSAT_CATEGORIES = [
  "Words in Context",
  "Text Structure & Purpose",
  "Cross-Text Connections",
  "Command of Evidence (Textual)",
  "Command of Evidence (Quantitative)",
  "Central Ideas & Details",
  "Inferences",
  "Rhetoric",
  "Standard English Conventions",
  "Transitions",
] as const;

export type DsatCategory = (typeof DSAT_CATEGORIES)[number];

// Per-question earning rates (minutes of gaming per question)
export const EARNING_RATES = {
  correctHard: 0.75,    // correct + difficulty >= 600
  correctMedium: 0.5,   // correct + difficulty 450-599
  correctEasy: 0.25,    // correct + difficulty < 450
  incorrect: 0,         // no reward for wrong answers
} as const;

// Per-rep earning rate for vocabulary practice.
//
// Deliberately well below the passage rates: a vocab rep takes a few seconds
// where a passage question takes a minute or more. Paying them equally would
// make vocabulary the cheapest possible route to the weekly cap, and passage
// practice — the thing the test actually scores — would stop happening. At
// 0.1/rep it takes 450 correct answers to cap out on vocabulary alone, so the
// mode is worth doing but never the efficient way to farm minutes.
//
// Vocabulary earnings count against the SAME weekly cap as questions
// (DEFAULT_SETTINGS.weeklyCapMinutes) and land in the same time_balances
// table, so there is one pool of gaming time, not two.
export const VOCAB_EARNING_RATES = {
  correct: 0.1,
  incorrect: 0,
} as const;

export const VOCAB_MASTERY = {
  // Consecutive correct answers (across separate sessions/days, since reviews
  // are scheduled a day out at minimum) before a word is considered learned
  // and retired from the rotation.
  consecutiveCorrectToMaster: 3,
  // Review spacing after each correct answer, indexed by consecutive_correct.
  // Past the end of the array the word is mastered and no longer scheduled.
  reviewIntervalDays: [1, 3, 7] as readonly number[],
  // How many distinct generated sentences to keep on hand per word. Below
  // this, background generation tops the word up.
  itemsPerWordTarget: 3,
} as const;

export const DEFAULT_SETTINGS = {
  weeklyCapMinutes: 45,
  decayDays: 7,
  weekendBaseMinutes: 30,
} as const;

export const ELO_K_FACTOR = 48;

export const DIFFICULTY_BANDS = {
  easy: { min: 300, max: 450 },
  medium: { min: 450, max: 600 },
  hard: { min: 600, max: 800 },
} as const;

export type DifficultyBand = keyof typeof DIFFICULTY_BANDS;

// Minutes are stored as numeric(5,2) and earned in 0.25 increments. Round to
// 2 decimals to suppress floating-point noise, then strip trailing zeros so
// integer values render as "15" instead of "15.00".
export function formatMinutes(n: number): string {
  const rounded = Math.round(Number(n) * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}
