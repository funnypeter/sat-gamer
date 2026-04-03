// ─── Row types for all tables ───

export interface Family {
  id: string;
  name: string;
  settings: FamilySettings;
  created_at: string;
}

export interface FamilySettings {
  accuracyTiers: { min: number; minutes: number }[];
  decayDays: number;
  dailyCapMinutes: number;
  weekendBaseMinutes: number;
  blockMinutes: number;
}

export interface User {
  id: string; // matches auth.users.id
  family_id: string;
  role: "student" | "parent";
  display_name: string;
  email: string;
  avatar_url: string | null;
  created_at: string;
}

export interface QuestionChoice {
  label: string; // "A" | "B" | "C" | "D"
  text: string;
}

export interface Question {
  id: string;
  category: string;
  passage_text: string;
  question_text: string;
  choices: QuestionChoice[];
  correct_answer: string; // "A" | "B" | "C" | "D"
  explanations: Record<string, string>; // keyed by label
  difficulty_rating: number; // Elo-scale 300–800
  generated_by: string; // "gemini" etc.
  created_at: string;
}

export interface Session {
  id: string;
  student_id: string;
  started_at: string;
  ended_at: string | null;
  total_questions: number;
  correct_count: number;
  accuracy: number | null;
  minutes_earned: number;
  block_seconds: number; // accumulated seconds in current block
  status: "active" | "completed" | "abandoned";
}

export interface StudentQuestion {
  id: string;
  session_id: string;
  student_id: string;
  question_id: string;
  answer_given: string;
  is_correct: boolean;
  time_spent_seconds: number;
  elo_before: number;
  elo_after: number;
  answered_at: string;
}

export interface StudentStats {
  id: string;
  student_id: string;
  category: string;
  elo_rating: number;
  total_attempted: number;
  total_correct: number;
  last_practiced: string | null;
  updated_at: string;
}

export interface TimeBalance {
  id: string;
  student_id: string;
  session_id: string;
  minutes_earned: number;
  minutes_remaining: number;
  earned_at: string;
  expires_at: string;
  redeemed: boolean;
}

export interface RedemptionRequest {
  id: string;
  student_id: string;
  requested_minutes: number;
  activity_description: string;
  status: "pending" | "approved" | "denied";
  parent_id: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface Streak {
  id: string;
  student_id: string;
  current_streak: number;
  longest_streak: number;
  last_practice_date: string | null;
  updated_at: string;
}

export interface SpacedRepetition {
  id: string;
  student_id: string;
  question_id: string;
  next_review_date: string;
  interval_days: number;
  ease_factor: number;
  review_count: number;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  data: Record<string, unknown> | null;
  created_at: string;
}

// ─── Database helper type for Supabase client generics ───

export interface Database {
  public: {
    Tables: {
      families: {
        Row: Family;
        Insert: Omit<Family, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Family>;
        Relationships: [];
      };
      users: {
        Row: User;
        Insert: Omit<User, "created_at"> & { created_at?: string };
        Update: Partial<User>;
        Relationships: [
          {
            foreignKeyName: "users_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          }
        ];
      };
      questions: {
        Row: Question;
        Insert: Omit<Question, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Question>;
        Relationships: [];
      };
      sessions: {
        Row: Session;
        Insert: Omit<Session, "id" | "started_at"> & {
          id?: string;
          started_at?: string;
        };
        Update: Partial<Session>;
        Relationships: [
          {
            foreignKeyName: "sessions_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      student_questions: {
        Row: StudentQuestion;
        Insert: Omit<StudentQuestion, "id" | "answered_at"> & {
          id?: string;
          answered_at?: string;
        };
        Update: Partial<StudentQuestion>;
        Relationships: [
          {
            foreignKeyName: "student_questions_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_questions_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_questions_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          }
        ];
      };
      student_stats: {
        Row: StudentStats;
        Insert: Omit<StudentStats, "id" | "updated_at"> & {
          id?: string;
          updated_at?: string;
        };
        Update: Partial<StudentStats>;
        Relationships: [
          {
            foreignKeyName: "student_stats_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      time_balances: {
        Row: TimeBalance;
        Insert: Omit<TimeBalance, "id" | "earned_at"> & {
          id?: string;
          earned_at?: string;
        };
        Update: Partial<TimeBalance>;
        Relationships: [
          {
            foreignKeyName: "time_balances_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_balances_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "sessions";
            referencedColumns: ["id"];
          }
        ];
      };
      redemption_requests: {
        Row: RedemptionRequest;
        Insert: Omit<RedemptionRequest, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<RedemptionRequest>;
        Relationships: [
          {
            foreignKeyName: "redemption_requests_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "redemption_requests_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      streaks: {
        Row: Streak;
        Insert: Omit<Streak, "id" | "updated_at"> & {
          id?: string;
          updated_at?: string;
        };
        Update: Partial<Streak>;
        Relationships: [
          {
            foreignKeyName: "streaks_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      spaced_repetition: {
        Row: SpacedRepetition;
        Insert: Omit<SpacedRepetition, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<SpacedRepetition>;
        Relationships: [
          {
            foreignKeyName: "spaced_repetition_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "spaced_repetition_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          }
        ];
      };
      notifications: {
        Row: Notification;
        Insert: Omit<Notification, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Notification>;
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    Views: {};
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    Functions: {};
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    Enums: {};
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    CompositeTypes: {};
  };
}
