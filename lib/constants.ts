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

export const DEFAULT_SETTINGS = {
  accuracyTiers: [
    { min: 90, minutes: 15 },
    { min: 80, minutes: 12 },
    { min: 70, minutes: 10 },
    { min: 60, minutes: 7 },
    { min: 0, minutes: 5 },
  ],
  decayDays: 7,
  dailyCapMinutes: 60,
  weekendBaseMinutes: 30,
  blockMinutes: 15,
} as const;

export const ELO_K_FACTOR = 32;

export const DIFFICULTY_BANDS = {
  easy: { min: 300, max: 450 },
  medium: { min: 450, max: 600 },
  hard: { min: 600, max: 800 },
} as const;

export type DifficultyBand = keyof typeof DIFFICULTY_BANDS;
