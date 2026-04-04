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
