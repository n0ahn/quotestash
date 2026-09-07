export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type QuoteLine = {
  said_by: string;
  text: string;
};

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          first_name: string;
          email: string;
          avatar_url: string | null;
        };
        Insert: {
          id: string;
          first_name: string;
          email: string;
          avatar_url?: string | null;
        };
        Update: {
          id?: string;
          first_name?: string;
          email?: string;
          avatar_url?: string | null;
        };
        Relationships: [];
      };

      rooms: {
        Row: {
          id: string;
          name: string;
          code: string;
          owner_id: string;
          photo_url: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          code?: string;
          owner_id: string;
          photo_url?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          code?: string;
          owner_id?: string;
          photo_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'rooms_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };

      room_members: {
        Row: {
          room_id: string;
          user_id: string;
        };
        Insert: {
          room_id: string;
          user_id: string;
        };
        Update: {
          room_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'room_members_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'room_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };

      room_tags: {
        Row: {
          id: string;
          room_id: string;
          name: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          name: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'room_tags_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          }
        ];
      };

      quotes: {
        Row: {
          id: string;
          room_id: string;
          added_by: string;
          lines: QuoteLine[];
          color: string;
          tags: string[];
          is_nsfw: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          added_by: string;
          lines: QuoteLine[];
          color?: string;
          tags?: string[];
          is_nsfw?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          added_by?: string;
          lines?: QuoteLine[];
          color?: string;
          tags?: string[];
          is_nsfw?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'quotes_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quotes_added_by_fkey';
            columns: ['added_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };

      quote_favorites: {
        Row: {
          quote_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          quote_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          quote_id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'quote_favorites_quote_id_fkey';
            columns: ['quote_id'];
            isOneToOne: false;
            referencedRelation: 'quotes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quote_favorites_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };

      quote_comments: {
        Row: {
          id: string;
          quote_id: string;
          user_id: string;
          parent_comment_id: string | null;
          reply_to_name: string | null;
          text: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          quote_id: string;
          user_id: string;
          parent_comment_id?: string | null;
          reply_to_name?: string | null;
          text: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          quote_id?: string;
          user_id?: string;
          parent_comment_id?: string | null;
          reply_to_name?: string | null;
          text?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'quote_comments_quote_id_fkey';
            columns: ['quote_id'];
            isOneToOne: false;
            referencedRelation: 'quotes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quote_comments_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quote_comments_parent_comment_id_fkey';
            columns: ['parent_comment_id'];
            isOneToOne: false;
            referencedRelation: 'quote_comments';
            referencedColumns: ['id'];
          }
        ];
      };

      quiz_results: {
        Row: {
          id: string;
          room_id: string;
          user_id: string;
          mode: 'who_said_it' | 'fact_or_fluff';
          correct_count: number;
          total_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          user_id: string;
          mode: 'who_said_it' | 'fact_or_fluff';
          correct_count: number;
          total_count: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          user_id?: string;
          mode?: 'who_said_it' | 'fact_or_fluff';
          correct_count?: number;
          total_count?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'quiz_results_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quiz_results_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };

      comment_likes: {
        Row: {
          comment_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          comment_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          comment_id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'comment_likes_comment_id_fkey';
            columns: ['comment_id'];
            isOneToOne: false;
            referencedRelation: 'quote_comments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'comment_likes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };

      quote_reactions: {
        Row: {
          id: string;
          quote_id: string;
          user_id: string;
          emoji: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          quote_id: string;
          user_id: string;
          emoji: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          quote_id?: string;
          user_id?: string;
          emoji?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'quote_reactions_quote_id_fkey';
            columns: ['quote_id'];
            isOneToOne: false;
            referencedRelation: 'quotes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quote_reactions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };

      notifications: {
        Row: {
          id: string;
          user_id: string;
          room_id: string;
          actor_id: string | null;
          type: 'new_quote' | 'new_comment' | 'new_reply' | 'comment_like' | 'quote_favorite' | 'reaction';
          quote_id: string | null;
          comment_id: string | null;
          reaction_emoji: string | null;
          preview_text: string | null;
          read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          room_id: string;
          actor_id?: string | null;
          type: 'new_quote' | 'new_comment' | 'new_reply' | 'comment_like' | 'quote_favorite' | 'reaction';
          quote_id?: string | null;
          comment_id?: string | null;
          reaction_emoji?: string | null;
          preview_text?: string | null;
          read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          room_id?: string;
          actor_id?: string | null;
          type?: 'new_quote' | 'new_comment' | 'new_reply' | 'comment_like' | 'quote_favorite' | 'reaction';
          quote_id?: string | null;
          comment_id?: string | null;
          reaction_emoji?: string | null;
          preview_text?: string | null;
          read?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_room_id_fkey';
            columns: ['room_id'];
            isOneToOne: false;
            referencedRelation: 'rooms';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_quote_id_fkey';
            columns: ['quote_id'];
            isOneToOne: false;
            referencedRelation: 'quotes';
            referencedColumns: ['id'];
          }
        ];
      };
    };

    Views: {
      [_ in never]: never;
    };

    Functions: {
      join_room: {
        Args: {
          room_code: string;
        };
        Returns: void;
      };
    };

    Enums: {
      [_ in never]: never;
    };

    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type RoomWithOwnership =
  Database['public']['Tables']['rooms']['Row'] & {
    isOwner: boolean;
  };

export type QuoteWithDetails =
  Database['public']['Tables']['quotes']['Row'] & {
    adder?: {
      id: string;
      first_name: string;
      avatar_url: string | null;
    } | null;
    comment_count?: number;
  };

export type CommentWithDetails =
  Database['public']['Tables']['quote_comments']['Row'] & {
    author?: {
      id: string;
      first_name: string;
      avatar_url: string | null;
    } | null;
    like_count: number;
    is_liked: boolean;
    replies: CommentWithDetails[];
  };

export type RoomTag =
  Database['public']['Tables']['room_tags']['Row'];

export type NotificationType = Database['public']['Tables']['notifications']['Row']['type'];

export type NotificationWithDetails =
  Database['public']['Tables']['notifications']['Row'] & {
    actor?: {
      id: string;
      first_name: string;
      avatar_url: string | null;
    } | null;
    room?: {
      id: string;
      name: string;
    } | null;
  };

export function notificationMessage(n: NotificationWithDetails): string {
  const name = n.actor?.first_name ?? 'Someone';
  switch (n.type) {
    case 'new_quote':
      return `${name} added a new quote`;
    case 'new_comment':
      return `${name} commented on your quote`;
    case 'new_reply':
      return `${name} replied to your comment`;
    case 'comment_like':
      return `${name} liked your comment`;
    case 'quote_favorite':
      return `${name} favorited your quote`;
    case 'reaction':
      return `${name} reacted ${n.reaction_emoji ?? ''} to your quote`;
    default:
      return `${name} did something`;
  }
}

/** Waar moet je heen als je op deze notificatie klikt? */
export function notificationHref(n: NotificationWithDetails): string {
  if (n.quote_id) return `/rooms/${n.room_id}/quotes/${n.quote_id}`;
  return `/rooms/${n.room_id}/quotes`;
}

export type QuizMode = 'who_said_it' | 'fact_or_fluff';

export type QuizResult =
  Database['public']['Tables']['quiz_results']['Row'];

export type QuizStats = {
  quizzesPlayed: number;
  totalCorrect: number;
  totalQuestions: number;
  accuracy: number; // 0-100
  bestMode: QuizMode | null;
};

export function summarizeQuizResults(rows: Pick<QuizResult, 'mode' | 'correct_count' | 'total_count'>[]): QuizStats {
  const totalCorrect = rows.reduce((sum, r) => sum + r.correct_count, 0);
  const totalQuestions = rows.reduce((sum, r) => sum + r.total_count, 0);

  const modeTotals: Record<string, { correct: number; total: number }> = {};
  for (const r of rows) {
    modeTotals[r.mode] ??= { correct: 0, total: 0 };
    modeTotals[r.mode].correct += r.correct_count;
    modeTotals[r.mode].total += r.total_count;
  }

  let bestMode: QuizMode | null = null;
  let bestAccuracy = -1;
  for (const [mode, totals] of Object.entries(modeTotals)) {
    const acc = totals.total > 0 ? totals.correct / totals.total : 0;
    if (acc > bestAccuracy) {
      bestAccuracy = acc;
      bestMode = mode as QuizMode;
    }
  }

  return {
    quizzesPlayed: rows.length,
    totalCorrect,
    totalQuestions,
    accuracy: totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0,
    bestMode
  };
}

export const QUIZ_MODE_LABELS: Record<QuizMode, string> = {
  who_said_it: 'Who Said It?',
  fact_or_fluff: 'Fact or Fluff'
};