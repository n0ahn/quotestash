export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          first_name: string
          email: string
        }
        Insert: {
          id: string
          first_name: string
          email: string
        }
        Update: {
          id?: string
          first_name?: string
          email?: string
        }
      }
      rooms: {
        Row: {
          id: string
          name: string
          code: string
          owner_id: string
        }
        Insert: {
          id?: string
          name: string
          code?: string
          owner_id: string
        }
        Update: {
          id?: string
          name?: string
          code?: string
          owner_id?: string
        }
      }
      room_members: {
        Row: {
          room_id: string
          user_id: string
        }
        Insert: {
          room_id: string
          user_id: string
        }
        Update: {
          room_id?: string
          user_id?: string
        }
      }
      quotes: {
        Row: {
          id: string
          room_id: string
          added_by: string
          said_by: string
          content: string
          color: string
          tags: string[]
          is_nsfw: boolean
          created_at: string
        }
        Insert: {
          id?: string
          room_id: string
          added_by: string
          said_by: string
          content: string
          color?: string
          tags?: string[]
          is_nsfw?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          room_id?: string
          added_by?: string
          said_by?: string
          content?: string
          color?: string
          tags?: string[]
          is_nsfw?: boolean
          created_at?: string
        }
      }
      quote_favorites: {
        Row: {
          quote_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          quote_id: string
          user_id: string
          created_at?: string
        }
        Update: {
          quote_id?: string
          user_id?: string
          created_at?: string
        }
      }
    }
    Functions: {
      join_room: {
        Args: { room_code: string }
        Returns: void
      }
    }
  }
}

export type RoomWithOwnership = Database['public']['Tables']['rooms']['Row'] & {
  isOwner: boolean
}

export type QuoteWithDetails = Database['public']['Tables']['quotes']['Row'] & {
  adder?: { first_name: string }
}