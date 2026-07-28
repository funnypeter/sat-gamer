import { create } from "zustand";
import type { VocabItem } from "@/components/student/VocabCard";
import type { VocabMasteryResult } from "@/components/student/VocabFeedback";

/**
 * Session state for vocabulary practice.
 *
 * Mirrors `session-store.ts` so a student who navigates to the dashboard and
 * back resumes their session instead of orphaning it.
 *
 * Note what's *not* here: there is no `currentChoiceMap`. Vocabulary items
 * store their choices already shuffled at generation time and are never
 * re-shuffled at serve time, so displayed labels always equal stored labels
 * and there is no displayed-vs-original translation to keep in sync. (See the
 * choiceMap discussion in the root CLAUDE.md for why passage questions need
 * one and this doesn't.)
 */
interface VocabState {
  sessionId: string | null;
  isActive: boolean;
  totalAnswered: number;
  correctCount: number;
  masteredThisSession: number;
  currentItem: VocabItem | null;
  currentReason: string | null;
  showFeedback: boolean;
  lastResult: {
    isCorrect: boolean;
    correctAnswer: string;
    explanations: Record<string, string>;
    word: string;
    definition: string;
    mastery: VocabMasteryResult;
  } | null;

  startSession: (sessionId: string) => void;
  endSession: () => void;
  setCurrentItem: (item: VocabItem | null, reason?: string | null) => void;
  recordAnswer: (result: NonNullable<VocabState["lastResult"]>) => void;
  dismissFeedback: () => void;
}

export const useVocabStore = create<VocabState>((set) => ({
  sessionId: null,
  isActive: false,
  totalAnswered: 0,
  correctCount: 0,
  masteredThisSession: 0,
  currentItem: null,
  currentReason: null,
  showFeedback: false,
  lastResult: null,

  startSession: (sessionId) =>
    set({
      sessionId,
      isActive: true,
      totalAnswered: 0,
      correctCount: 0,
      masteredThisSession: 0,
      currentItem: null,
      currentReason: null,
      showFeedback: false,
      lastResult: null,
    }),

  endSession: () =>
    set({
      sessionId: null,
      isActive: false,
      currentItem: null,
      currentReason: null,
      showFeedback: false,
      lastResult: null,
    }),

  setCurrentItem: (item, reason = null) =>
    set({ currentItem: item, currentReason: reason }),

  recordAnswer: (result) =>
    set((state) => ({
      totalAnswered: state.totalAnswered + 1,
      correctCount: state.correctCount + (result.isCorrect ? 1 : 0),
      masteredThisSession:
        state.masteredThisSession + (result.mastery.justMastered ? 1 : 0),
      showFeedback: true,
      lastResult: result,
    })),

  dismissFeedback: () => set({ showFeedback: false, lastResult: null }),
}));
