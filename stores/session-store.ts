import { create } from "zustand";
import type { Question } from "@/lib/types/database";

interface SessionState {
  sessionId: string | null;
  isActive: boolean;
  blockSeconds: number; // seconds elapsed in current 15-min block
  totalQuestions: number;
  correctCount: number;
  currentQuestion: Question | null;
  // displayed label -> original label for questions served with
  // shuffled choices (SR reviews / repeat fallbacks). Lives here, not
  // in page state: the store outlives the practice page, so a map kept
  // in useState would reset to null on remount while the shuffled
  // question survived — answers would then be graded against the wrong
  // letters. Null for fresh questions (labels match storage 1:1).
  currentChoiceMap: Record<string, string> | null;
  timeEarnedToday: number; // total minutes earned today
  showFeedback: boolean;
  lastAnswerCorrect: boolean | null;
  lastCorrectAnswer: string | null;
  lastExplanations: Record<string, string> | null;

  // Actions
  startSession: (sessionId: string) => void;
  endSession: () => void;
  setCurrentQuestion: (
    question: Question | null,
    choiceMap?: Record<string, string> | null
  ) => void;
  recordAnswer: (
    correct: boolean,
    correctAnswer: string,
    explanations: Record<string, string>
  ) => void;
  dismissFeedback: () => void;
  tickBlock: () => void;
  setBlockSeconds: (seconds: number) => void;
  addTimeEarned: (minutes: number) => void;
  setTimeEarnedToday: (minutes: number) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessionId: null,
  isActive: false,
  blockSeconds: 0,
  totalQuestions: 0,
  correctCount: 0,
  currentQuestion: null,
  currentChoiceMap: null,
  timeEarnedToday: 0,
  showFeedback: false,
  lastAnswerCorrect: null,
  lastCorrectAnswer: null,
  lastExplanations: null,

  startSession: (sessionId) =>
    set({
      sessionId,
      isActive: true,
      blockSeconds: 0,
      totalQuestions: 0,
      correctCount: 0,
      currentQuestion: null,
      currentChoiceMap: null,
      showFeedback: false,
    }),

  endSession: () =>
    set({
      sessionId: null,
      isActive: false,
      currentQuestion: null,
      currentChoiceMap: null,
      showFeedback: false,
    }),

  setCurrentQuestion: (question, choiceMap) =>
    set({ currentQuestion: question, currentChoiceMap: choiceMap ?? null }),

  recordAnswer: (correct, correctAnswer, explanations) =>
    set((state) => ({
      totalQuestions: state.totalQuestions + 1,
      correctCount: state.correctCount + (correct ? 1 : 0),
      showFeedback: true,
      lastAnswerCorrect: correct,
      lastCorrectAnswer: correctAnswer,
      lastExplanations: explanations,
    })),

  dismissFeedback: () =>
    set({ showFeedback: false }),

  tickBlock: () =>
    set((state) => ({ blockSeconds: state.blockSeconds + 1 })),

  setBlockSeconds: (seconds) =>
    set({ blockSeconds: seconds }),

  addTimeEarned: (minutes) =>
    set((state) => ({
      timeEarnedToday: state.timeEarnedToday + minutes,
    })),

  setTimeEarnedToday: (minutes) =>
    set({ timeEarnedToday: minutes }),
}));
