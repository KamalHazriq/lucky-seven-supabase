import type {
  Card,
  ChatMessage,
  DevPrivileges,
  GameSettings,
  LockInfo,
  LogEntry,
  VoteKick,
} from './types'
import type { GameActionEvent } from './logEvents'

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
      analytics_daily: {
        Row: {
          day: string
          page_views: number
          games_created: number
          games_started: number
          games_finished: number
          rematches: number
          feedback_count: number
          dev_activations: number
          joins: number
          unique_sessions: number
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['analytics_daily']['Row']> & { day: string }
        Update: Partial<Database['public']['Tables']['analytics_daily']['Row']>
      }
      analytics_events: {
        Row: {
          id: string
          event_name: string
          user_id: string | null
          game_id: string | null
          session_id: string | null
          route: string | null
          device_type: string | null
          screen_width: number | null
          theme: string | null
          metadata: Json
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['analytics_events']['Row']>
        Update: Partial<Database['public']['Tables']['analytics_events']['Row']>
      }
      client_error_logs: {
        Row: {
          id: string
          user_id: string | null
          session_id: string | null
          error_name: string
          message: string
          stack: string | null
          context: string | null
          route: string | null
          device_type: string | null
          user_agent: string | null
          app_version: string | null
          created_at: string
        }
        Insert: Partial<Database['public']['Tables']['client_error_logs']['Row']>
        Update: Partial<Database['public']['Tables']['client_error_logs']['Row']>
      }
      feedback: {
        Row: {
          id: string
          rating: number
          name: string
          message: string
          app_version: string
          theme: string
          user_id: string | null
          created_at: number
        }
        Insert: Partial<Database['public']['Tables']['feedback']['Row']>
        Update: Partial<Database['public']['Tables']['feedback']['Row']>
      }
      game_chat_messages: {
        Row: {
          id: ChatMessage['id']
          game_id: string
          user_id: string
          display_name: string
          seat_index: number
          text: string
          ts: number
        }
        Insert: Database['public']['Tables']['game_chat_messages']['Row']
        Update: Partial<Database['public']['Tables']['game_chat_messages']['Row']>
      }
      game_dev_access: {
        Row: {
          game_id: string
          uid: string
          activated_at: number
          privileges: DevPrivileges
        }
        Insert: Database['public']['Tables']['game_dev_access']['Row']
        Update: Partial<Database['public']['Tables']['game_dev_access']['Row']>
      }
      game_history: {
        Row: {
          id: string
          game_id: string
          ts: number
          msg: string
          event: GameActionEvent | null
        }
        Insert: Partial<Database['public']['Tables']['game_history']['Row']> & {
          game_id: string
          msg: string
        }
        Update: Partial<Database['public']['Tables']['game_history']['Row']>
      }
      game_internal: {
        Row: {
          game_id: string
          draw_pile: Card[]
        }
        Insert: Database['public']['Tables']['game_internal']['Row']
        Update: Partial<Database['public']['Tables']['game_internal']['Row']>
      }
      game_players: {
        Row: {
          game_id: string
          player_id: string
          display_name: string
          seat_index: number
          connected: boolean
          locks: boolean[]
          locked_by: (LockInfo | null)[]
          color_key: number | null
          afk_strikes: number
        }
        Insert: Database['public']['Tables']['game_players']['Row']
        Update: Partial<Database['public']['Tables']['game_players']['Row']>
      }
      game_private_state: {
        Row: {
          game_id: string
          player_id: string
          hand: Card[]
          drawn_card: Card | null
          drawn_card_source: 'pile' | 'discard' | null
          known: Record<string, Card>
          opponent_known: Record<string, Record<string, Card>>
        }
        Insert: Partial<Database['public']['Tables']['game_private_state']['Row']> & {
          game_id: string
          player_id: string
        }
        Update: Partial<Database['public']['Tables']['game_private_state']['Row']>
      }
      game_reveals: {
        Row: {
          game_id: string
          player_id: string
          display_name: string
          hand: Card[]
          total: number
          sevens: number
        }
        Insert: Database['public']['Tables']['game_reveals']['Row']
        Update: Partial<Database['public']['Tables']['game_reveals']['Row']>
      }
      game_summaries: {
        Row: {
          game_id: string
          finished_at: number
          player_count: number
          winners: Json
          turns: number
          deck_size: number
          settings: GameSettings
        }
        Insert: Database['public']['Tables']['game_summaries']['Row']
        Update: Partial<Database['public']['Tables']['game_summaries']['Row']>
      }
      games: {
        Row: {
          id: string
          status: 'lobby' | 'active' | 'ending' | 'finished'
          host_id: string
          created_at: number
          max_players: number
          current_turn_player_id: string | null
          draw_pile_count: number
          discard_top: Card | null
          seed: string
          end_called_by: string | null
          end_round_start_seat_index: number | null
          log: LogEntry[]
          turn_phase: 'draw' | 'action' | null
          player_order: string[]
          join_code: string
          action_version: number
          last_action_at: number
          settings: GameSettings
          spent_power_card_ids: string[]
          turn_start_at: number
          vote_kick: VoteKick | null
          rematch_lobby_id: string | null
        }
        Insert: Partial<Database['public']['Tables']['games']['Row']>
        Update: Partial<Database['public']['Tables']['games']['Row']>
      }
      global_stats: {
        Row: {
          id: number
          games_played: number
          total_visits: number
          last_game_at: number | null
          page_views: number
          games_finished: number
          total_players: number
        }
        Insert: Partial<Database['public']['Tables']['global_stats']['Row']>
        Update: Partial<Database['public']['Tables']['global_stats']['Row']>
      }
      maintenance_runs: {
        Row: {
          id: string
          started_at: string
          finished_at: string | null
          status: string
          summary: Json | null
          error_detail: string | null
        }
        Insert: Partial<Database['public']['Tables']['maintenance_runs']['Row']>
        Update: Partial<Database['public']['Tables']['maintenance_runs']['Row']>
      }
    }
    Views: Record<string, never>
    Functions: {
      activate_dev_mode: { Args: { p_game_id: string; p_code: string }; Returns: void }
      call_end: { Args: { p_game_id: string }; Returns: void }
      cancel_draw: { Args: { p_game_id: string }; Returns: void }
      cancel_vote_kick: { Args: { p_game_id: string }; Returns: void }
      cast_vote_kick: { Args: { p_game_id: string; p_vote_yes: boolean }; Returns: void }
      create_game: {
        Args: {
          p_display_name: string
          p_max_players: number
          p_settings: GameSettings
          p_join_code: string
          p_seed: string
          p_color_key?: number | null
        }
        Returns: string
      }
      deactivate_dev_mode: { Args: { p_game_id: string }; Returns: void }
      dev_reorder_draw_pile: { Args: { p_game_id: string; p_reordered: Card[] }; Returns: void }
      discard_drawn: { Args: { p_game_id: string }; Returns: void }
      draw_from_pile: { Args: { p_game_id: string }; Returns: void }
      find_game_by_code: { Args: { p_join_code: string }; Returns: string | null }
      get_global_stats: {
        Args: Record<string, never>
        Returns: Array<{
          games_played: number
          total_visits: number
          last_game_at: number | null
          games_finished: number
          total_players: number
          unique_players: number
        }>
      }
      increment_visits: { Args: Record<string, never>; Returns: void }
      initiate_vote_kick: { Args: { p_game_id: string; p_target_player: string }; Returns: void }
      join_game: { Args: { p_game_id: string; p_display_name: string; p_color_key?: number | null }; Returns: void }
      leave_game: { Args: { p_game_id: string }; Returns: void }
      leave_lobby: { Args: { p_game_id: string }; Returns: void }
      log_client_error: {
        Args: {
          p_user_id?: string | null
          p_session_id?: string | null
          p_error_name?: string | null
          p_message?: string | null
          p_stack?: string | null
          p_context?: string | null
          p_route?: string | null
          p_device_type?: string | null
          p_user_agent?: string | null
          p_app_version?: string | null
        }
        Returns: void
      }
      play_again: {
        Args: {
          p_finished_game_id: string
          p_display_name: string
          p_max_players: number
          p_settings: GameSettings
          p_join_code: string
          p_seed: string
          p_color_key?: number | null
        }
        Returns: string
      }
      reveal_hand: { Args: { p_game_id: string }; Returns: void }
      run_maintenance: {
        Args: {
          p_chat_days?: number
          p_history_days?: number
          p_games_days?: number
          p_analytics_days?: number
          p_error_log_days?: number
        }
        Returns: Json
      }
      send_chat_message: { Args: { p_game_id: string; p_text: string; p_msg_id: string }; Returns: void }
      skip_turn: { Args: { p_game_id: string; p_expected_action_version: number }; Returns: void }
      start_game: { Args: { p_game_id: string; p_deck: Card[] }; Returns: void }
      submit_feedback: {
        Args: {
          p_rating: number
          p_name: string
          p_message: string
          p_app_version: string
          p_theme: string
        }
        Returns: void
      }
      swap_with_slot: { Args: { p_game_id: string; p_slot_index: number }; Returns: void }
      take_from_discard: { Args: { p_game_id: string }; Returns: void }
      track_event: {
        Args: {
          p_event_name: string
          p_user_id?: string | null
          p_game_id?: string | null
          p_session_id?: string | null
          p_route?: string | null
          p_device_type?: string | null
          p_screen_width?: number | null
          p_theme?: string | null
          p_metadata?: Json
        }
        Returns: void
      }
      update_game_settings: { Args: { p_game_id: string; p_settings: Partial<GameSettings> }; Returns: void }
      update_player_profile: {
        Args: {
          p_game_id: string
          p_display_name?: string | null
          p_color_key?: number | null
        }
        Returns: void
      }
      use_lock: { Args: { p_game_id: string; p_target_player: string; p_slot_index: number }; Returns: void }
      use_peek_all: { Args: { p_game_id: string; p_no_memory?: boolean }; Returns: Record<string, Card> }
      use_peek_all_opponent: {
        Args: { p_game_id: string; p_target_player: string; p_no_memory?: boolean }
        Returns: { cards: Record<string, Card>; playerName: string; locks: boolean[] }
      }
      use_peek_one: {
        Args: { p_game_id: string; p_slot_index: number; p_no_memory?: boolean }
        Returns: Card
      }
      use_peek_opponent: {
        Args: { p_game_id: string; p_target_player: string; p_slot_index: number; p_no_memory?: boolean }
        Returns: { card: Card; playerName: string }
      }
      use_rearrange: { Args: { p_game_id: string; p_target_player: string }; Returns: void }
      use_swap_power: {
        Args: {
          p_game_id: string
          p_a_player: string
          p_a_slot: number
          p_b_player: string
          p_b_slot: number
        }
        Returns: void
      }
      use_unlock: { Args: { p_game_id: string; p_target_player: string; p_slot_index: number }; Returns: void }
      write_game_summary: {
        Args: {
          p_game_id: string
          p_winners: Json
          p_player_count: number
          p_turns: number
          p_deck_size: number
          p_settings: GameSettings
        }
        Returns: void
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

type PublicSchema = Database['public']

export type TableName = keyof PublicSchema['Tables']
export type TableRow<T extends TableName> = PublicSchema['Tables'][T]['Row']
export type TableInsert<T extends TableName> = PublicSchema['Tables'][T]['Insert']
export type TableUpdate<T extends TableName> = PublicSchema['Tables'][T]['Update']

export type FunctionName = keyof PublicSchema['Functions']
export type FunctionArgs<T extends FunctionName> = PublicSchema['Functions'][T]['Args']
export type FunctionReturn<T extends FunctionName> = PublicSchema['Functions'][T]['Returns']
