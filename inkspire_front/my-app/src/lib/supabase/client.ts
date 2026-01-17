 import { createBrowserClient } from '@supabase/ssr'

 export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

  export type Database = {
    public: {
      Tables: {
        users: {
          Row: {
            id: string
            supabase_id: string
            email: string | null
            name: string | null
            avatar_url: string | null
            created_at: string
            updated_at: string
            metadata: Json | null
          }
          Insert: {
            id: string
            supabase_id?: string | null
            email?: string | null
            name?: string | null
            avatar_url?: string | null
            created_at?: string
            updated_at?: string
            metadata?: Json | null
          }
          Update: {
            id?: string
            supabase_id?: string | null
            email?: string | null
            name?: string | null
            avatar_url?: string | null
            created_at?: string
            updated_at?: string
            metadata?: Json | null
          }
          Relationships: []
        }
      }
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // This module is imported by many client components.
  // Do NOT throw during module evaluation; it will crash the entire app.
  export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

  function createStubSupabaseClient() {
    const notConfigured = () =>
      ({
        data: { session: null, user: null },
        error: {
          message:
            'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.',
        },
      }) as any

    return {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        getUser: async () => ({ data: { user: null }, error: null }),
        refreshSession: async () => ({ data: { session: null }, error: null }),
        setSession: async () => notConfigured(),
        signOut: async () => ({ error: null }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe: () => {} } },
          error: null,
        }),
      },
      from: () => {
        throw new Error('Supabase is not configured. Database operations are unavailable.')
      },
    } as any
  }

  export const supabase = isSupabaseConfigured
    ? createBrowserClient<Database>(supabaseUrl as string, supabaseAnonKey as string)
    : createStubSupabaseClient()