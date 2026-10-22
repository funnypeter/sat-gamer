import { create } from "zustand";
import type { Question } from "@/lib/types/database";
import type { Subject } from "@/lib/constants";

interface SessionState {
  sessionId: string | null;
  isActive: boolean;
  /** Reading & Writing or Math — fixed for the life of a session. */
  subject: Subject;
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
  /** Grid-in questions only: every accepted form of the answer. */
  lastAcceptedAnswers: string[] | null;

  // Actions
  startSession: (sessionId: string, subject: Subject) => void;
  endSession: () => void;
  setCurrentQuestion: (
    question: Question | null,
    choiceMap?: Record<string, string> | null
  ) => void;
  recordAnswer: (
    correct: boolean,
    correctAnswer: string,
    explanations: Record<string, string>,
    acceptedAnswers?: string[] | null
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
  subject: "verbal",
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
  lastAcceptedAnswers: null,

  startSession: (sessionId, subject) =>
    set({
      sessionId,
      subject,
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

  recordAnswer: (correct, correctAnswer, explanations, acceptedAnswers = null) =>
    set((state) => ({
      totalQuestions: state.totalQuestions + 1,
      correctCount: state.correctCount + (correct ? 1 : 0),
      showFeedback: true,
      lastAnswerCorrect: correct,
      lastCorrectAnswer: correctAnswer,
      lastExplanations: explanations,
      lastAcceptedAnswers: acceptedAnswers,
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
