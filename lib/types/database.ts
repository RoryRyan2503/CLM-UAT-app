// Hand-authored Supabase database types (mirrors supabase/migrations/0001_init.sql).
// Every table includes `Relationships: []` so postgrest-js generic inference resolves inserts/updates correctly.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      testers: {
        Row: {
          id: string;
          name: string;
          email: string | null;
          department: string | null;
          persona: string | null;
          persona_id: string | null;
          access_code_hash: string;
          access_code_lookup: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          email?: string | null;
          department?: string | null;
          persona?: string | null;
          persona_id?: string | null;
          access_code_hash: string;
          access_code_lookup: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["testers"]["Insert"]>;
        Relationships: [];
      };
      admin_users: {
        Row: {
          id: string;
          auth_user_id: string;
          name: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id: string;
          name?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["admin_users"]["Insert"]>;
        Relationships: [];
      };
      tester_sessions: {
        Row: {
          id: string;
          tester_id: string;
          token_hash: string;
          expires_at: string;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tester_id: string;
          token_hash: string;
          expires_at: string;
          revoked_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tester_sessions"]["Insert"]>;
        Relationships: [];
      };
      login_attempts: {
        Row: {
          id: string;
          identifier: string;
          success: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          identifier: string;
          success: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["login_attempts"]["Insert"]>;
        Relationships: [];
      };
      vendors: {
        Row: {
          id: string;
          slug: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["vendors"]["Insert"]>;
        Relationships: [];
      };
      test_cases: {
        Row: {
          id: string;
          test_case_id: string;
          functional_area: string;
          persona: string | null;
          scenario: string;
          suggested_steps: string;
          expected_result: string;
          required_evidence: string;
          source_row_number: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          test_case_id: string;
          functional_area: string;
          persona?: string | null;
          scenario: string;
          suggested_steps: string;
          expected_result: string;
          required_evidence: string;
          source_row_number?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["test_cases"]["Insert"]>;
        Relationships: [];
      };
      personas: {
        Row: { id: string; name: string; created_at: string };
        Insert: { id?: string; name: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["personas"]["Insert"]>;
        Relationships: [];
      };
      persona_test_cases: {
        Row: { persona_id: string; test_case_id: string; created_at: string };
        Insert: { persona_id: string; test_case_id: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["persona_test_cases"]["Insert"]>;
        Relationships: [];
      };
      assignments: {
        Row: {
          id: string;
          tester_id: string;
          test_case_id: string;
          vendor_id: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          tester_id: string;
          test_case_id: string;
          vendor_id: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["assignments"]["Insert"]>;
        Relationships: [];
      };
      test_results: {
        Row: {
          id: string;
          assignment_id: string;
          actual_result: string | null;
          feature_adequate: boolean | null;
          improvement_needed: boolean | null;
          improvement_description: string | null;
          feature_user_friendly: boolean | null;
          status: string;
          grade: string | null;
          severity: string | null;
          defect_id: string | null;
          workaround_notes: string | null;
          usability_rating: number | null;
          configuration_required: boolean | null;
          vendor_assistance_required: boolean | null;
          blocked_reason: string | null;
          blocked_owner: string | null;
          blocked_target_date: string | null;
          started_at: string | null;
          completed_at: string | null;
          version: number;
          updated_by_tester_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          assignment_id: string;
          actual_result?: string | null;
          feature_adequate?: boolean | null;
          improvement_needed?: boolean | null;
          improvement_description?: string | null;
          feature_user_friendly?: boolean | null;
          status?: string;
          grade?: string | null;
          severity?: string | null;
          defect_id?: string | null;
          workaround_notes?: string | null;
          usability_rating?: number | null;
          configuration_required?: boolean | null;
          vendor_assistance_required?: boolean | null;
          blocked_reason?: string | null;
          blocked_owner?: string | null;
          blocked_target_date?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          version?: number;
          updated_by_tester_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["test_results"]["Insert"]>;
        Relationships: [];
      };
      comparisons: {
        Row: {
          id: string;
          tester_id: string;
          test_case_id: string;
          preferred_vendor: string | null;
          comments: string | null;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tester_id: string;
          test_case_id: string;
          preferred_vendor?: string | null;
          comments?: string | null;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["comparisons"]["Insert"]>;
        Relationships: [];
      };
      evidence: {
        Row: {
          id: string;
          test_result_id: string;
          kind: string;
          storage_path: string | null;
          file_name: string | null;
          mime_type: string | null;
          size_bytes: number | null;
          url: string | null;
          created_at: string;
          created_by_tester_id: string | null;
        };
        Insert: {
          id?: string;
          test_result_id: string;
          kind: string;
          storage_path?: string | null;
          file_name?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          url?: string | null;
          created_at?: string;
          created_by_tester_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["evidence"]["Insert"]>;
        Relationships: [];
      };
      defects: {
        Row: {
          id: string;
          defect_code: string;
          test_result_id: string;
          vendor_id: string;
          title: string;
          description: string | null;
          severity: string | null;
          status: string;
          retest_assignment_id: string | null;
          created_by_tester_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          defect_code: string;
          test_result_id: string;
          vendor_id: string;
          title: string;
          description?: string | null;
          severity?: string | null;
          status?: string;
          retest_assignment_id?: string | null;
          created_by_tester_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["defects"]["Insert"]>;
        Relationships: [];
      };
      result_history: {
        Row: {
          id: string;
          test_result_id: string;
          changed_by_tester_id: string | null;
          changed_by_admin: boolean;
          change_type: string;
          previous_values: Json | null;
          new_values: Json | null;
          version: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          test_result_id: string;
          changed_by_tester_id?: string | null;
          changed_by_admin?: boolean;
          change_type: string;
          previous_values?: Json | null;
          new_values?: Json | null;
          version: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["result_history"]["Insert"]>;
        Relationships: [];
      };
      import_batches: {
        Row: {
          id: string;
          file_name: string;
          imported_by: string | null;
          row_count: number;
          created_count: number;
          updated_count: number;
          error_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          file_name: string;
          imported_by?: string | null;
          row_count: number;
          created_count: number;
          updated_count: number;
          error_count: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["import_batches"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
