export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_chat_messages: {
        Row: {
          content: string
          created_at: string
          error: boolean
          id: string
          image: string | null
          role: string
          username: string
        }
        Insert: {
          content: string
          created_at?: string
          error?: boolean
          id?: string
          image?: string | null
          role: string
          username: string
        }
        Update: {
          content?: string
          created_at?: string
          error?: boolean
          id?: string
          image?: string | null
          role?: string
          username?: string
        }
        Relationships: []
      }
      ai_prompt_journal: {
        Row: {
          active: boolean | null
          category: string | null
          created_at: string | null
          data_source: string | null
          description: string | null
          example_answer: string | null
          id: string
          question: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          category?: string | null
          created_at?: string | null
          data_source?: string | null
          description?: string | null
          example_answer?: string | null
          id?: string
          question: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          category?: string | null
          created_at?: string | null
          data_source?: string | null
          description?: string | null
          example_answer?: string | null
          id?: string
          question?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      app_users: {
        Row: {
          biometrics_enabled: boolean
          created_at: string
          created_by: string | null
          email: string | null
          email_verified: boolean
          email_verify_required: boolean
          full_name: string | null
          id: string
          is_active: boolean
          last_login_at: string | null
          password_hash: string
          phone: string | null
          phone_verified: boolean
          phone_verify_required: boolean
          role: string
          two_fa_enabled: boolean
          two_fa_method: string | null
          two_fa_required_each_login: boolean
          updated_at: string
          username: string
        }
        Insert: {
          biometrics_enabled?: boolean
          created_at?: string
          created_by?: string | null
          email?: string | null
          email_verified?: boolean
          email_verify_required?: boolean
          full_name?: string | null
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          password_hash: string
          phone?: string | null
          phone_verified?: boolean
          phone_verify_required?: boolean
          role?: string
          two_fa_enabled?: boolean
          two_fa_method?: string | null
          two_fa_required_each_login?: boolean
          updated_at?: string
          username: string
        }
        Update: {
          biometrics_enabled?: boolean
          created_at?: string
          created_by?: string | null
          email?: string | null
          email_verified?: boolean
          email_verify_required?: boolean
          full_name?: string | null
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          password_hash?: string
          phone?: string | null
          phone_verified?: boolean
          phone_verify_required?: boolean
          role?: string
          two_fa_enabled?: boolean
          two_fa_method?: string | null
          two_fa_required_each_login?: boolean
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      contractors: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      daily_fixed_costs: {
        Row: {
          amount: number
          cost_date: string
          created_at: string
          id: string
          wash_name: string
        }
        Insert: {
          amount?: number
          cost_date: string
          created_at?: string
          id?: string
          wash_name: string
        }
        Update: {
          amount?: number
          cost_date?: string
          created_at?: string
          id?: string
          wash_name?: string
        }
        Relationships: []
      }
      expense_logs: {
        Row: {
          action: string
          changed_at: string
          changed_by: string
          expense_id: string
          id: string
          new_data: Json | null
          old_data: Json
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by: string
          expense_id: string
          id?: string
          new_data?: Json | null
          old_data: Json
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string
          expense_id?: string
          id?: string
          new_data?: Json | null
          old_data?: Json
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          comment: string | null
          contractor: string | null
          created_at: string
          created_by: string
          expense_date: string
          expense_type: string
          id: string
          wash_name: string
        }
        Insert: {
          amount: number
          comment?: string | null
          contractor?: string | null
          created_at?: string
          created_by: string
          expense_date?: string
          expense_type: string
          id?: string
          wash_name: string
        }
        Update: {
          amount?: number
          comment?: string | null
          contractor?: string | null
          created_at?: string
          created_by?: string
          expense_date?: string
          expense_type?: string
          id?: string
          wash_name?: string
        }
        Relationships: []
      }
      login_logs: {
        Row: {
          device_name: string | null
          error_message: string | null
          id: string
          ip_address: string | null
          logged_at: string
          status: string
          user_agent: string | null
          username: string
        }
        Insert: {
          device_name?: string | null
          error_message?: string | null
          id?: string
          ip_address?: string | null
          logged_at?: string
          status?: string
          user_agent?: string | null
          username: string
        }
        Update: {
          device_name?: string | null
          error_message?: string | null
          id?: string
          ip_address?: string | null
          logged_at?: string
          status?: string
          user_agent?: string | null
          username?: string
        }
        Relationships: []
      }
      monthly_expense_defaults: {
        Row: {
          active_months: number[]
          created_at: string
          default_amount: number
          expense_type: string
          id: string
          valid_from: string
          valid_to: string | null
          wash_name: string
        }
        Insert: {
          active_months?: number[]
          created_at?: string
          default_amount?: number
          expense_type: string
          id?: string
          valid_from?: string
          valid_to?: string | null
          wash_name: string
        }
        Update: {
          active_months?: number[]
          created_at?: string
          default_amount?: number
          expense_type?: string
          id?: string
          valid_from?: string
          valid_to?: string | null
          wash_name?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          author: string | null
          content: string
          created_at: string
          id: string
          image: string | null
          ocr_text: string | null
          tags: string[] | null
          updated_at: string
          wash_name: string | null
        }
        Insert: {
          author?: string | null
          content: string
          created_at?: string
          id?: string
          image?: string | null
          ocr_text?: string | null
          tags?: string[] | null
          updated_at?: string
          wash_name?: string | null
        }
        Update: {
          author?: string | null
          content?: string
          created_at?: string
          id?: string
          image?: string | null
          ocr_text?: string | null
          tags?: string[] | null
          updated_at?: string
          wash_name?: string | null
        }
        Relationships: []
      }
      notification_recipients: {
        Row: {
          created_at: string
          id: string
          name: string
          telegram_chat_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          telegram_chat_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          telegram_chat_id?: string
        }
        Relationships: []
      }
      notification_schedules: {
        Row: {
          active: boolean
          created_at: string
          custom_message: string | null
          days_of_week: number[]
          id: string
          is_recurring: boolean
          recipient_id: string
          send_time: string
          template_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          custom_message?: string | null
          days_of_week?: number[]
          id?: string
          is_recurring?: boolean
          recipient_id: string
          send_time?: string
          template_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          custom_message?: string | null
          days_of_week?: number[]
          id?: string
          is_recurring?: boolean
          recipient_id?: string
          send_time?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_schedules_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "notification_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_schedules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "notification_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          content: string
          created_at: string
          id: string
          is_ai_preset: boolean
          name: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_ai_preset?: boolean
          name: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_ai_preset?: boolean
          name?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          created_at: string
          id: string
          item_id: string
          item_title: string
          item_type: string
          message: string | null
          push_subscription: Json | null
          remind_at: string
          sent: boolean
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          item_title: string
          item_type: string
          message?: string | null
          push_subscription?: Json | null
          remind_at: string
          sent?: boolean
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          item_title?: string
          item_type?: string
          message?: string | null
          push_subscription?: Json | null
          remind_at?: string
          sent?: boolean
          username?: string
        }
        Relationships: []
      }
      report_cache: {
        Row: {
          cache_key: string
          created_at: string
          id: string
          report_data: Json
        }
        Insert: {
          cache_key: string
          created_at?: string
          id?: string
          report_data: Json
        }
        Update: {
          cache_key?: string
          created_at?: string
          id?: string
          report_data?: Json
        }
        Relationships: []
      }
      task_activity_log: {
        Row: {
          action: string
          created_at: string
          id: string
          new_status: string | null
          old_status: string | null
          performed_by: string | null
          task_id: string
          task_snapshot: Json
          task_title: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_status?: string | null
          old_status?: string | null
          performed_by?: string | null
          task_id: string
          task_snapshot: Json
          task_title: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_status?: string | null
          old_status?: string | null
          performed_by?: string | null
          task_id?: string
          task_snapshot?: Json
          task_title?: string
        }
        Relationships: []
      }
      task_assignees: {
        Row: {
          created_at: string
          id: string
          name: string
          telegram_chat_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          telegram_chat_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          telegram_chat_id?: string | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          notify_recipients: string[] | null
          parent_id: string | null
          priority: string
          status: string
          title: string
          updated_at: string
          wash_name: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          notify_recipients?: string[] | null
          parent_id?: string | null
          priority?: string
          status?: string
          title: string
          updated_at?: string
          wash_name?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          notify_recipients?: string[] | null
          parent_id?: string | null
          priority?: string
          status?: string
          title?: string
          updated_at?: string
          wash_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      two_fa_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          purpose: string
          used: boolean
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at: string
          id?: string
          purpose?: string
          used?: boolean
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          purpose?: string
          used?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "two_fa_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      webauthn_credentials: {
        Row: {
          created_at: string
          credential_id: string
          device_name: string | null
          id: string
          last_used_at: string | null
          public_key: string
          sign_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          credential_id: string
          device_name?: string | null
          id?: string
          last_used_at?: string | null
          public_key: string
          sign_count?: number
          user_id: string
        }
        Update: {
          created_at?: string
          credential_id?: string
          device_name?: string | null
          id?: string
          last_used_at?: string | null
          public_key?: string
          sign_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webauthn_credentials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      work_journal_entries: {
        Row: {
          author: string | null
          converted_id: string | null
          converted_to: string | null
          created_at: string
          id: string
          image: string | null
          message: string
          source: string
          tags: string[] | null
          telegram_group: string | null
          telegram_message_id: number | null
          telegram_user: string | null
          wash_name: string | null
        }
        Insert: {
          author?: string | null
          converted_id?: string | null
          converted_to?: string | null
          created_at?: string
          id?: string
          image?: string | null
          message: string
          source?: string
          tags?: string[] | null
          telegram_group?: string | null
          telegram_message_id?: number | null
          telegram_user?: string | null
          wash_name?: string | null
        }
        Update: {
          author?: string | null
          converted_id?: string | null
          converted_to?: string | null
          created_at?: string
          id?: string
          image?: string | null
          message?: string
          source?: string
          tags?: string[] | null
          telegram_group?: string | null
          telegram_message_id?: number | null
          telegram_user?: string | null
          wash_name?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      hash_password: { Args: { p_password: string }; Returns: string }
      verify_user_password: {
        Args: { p_password: string; p_username: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
