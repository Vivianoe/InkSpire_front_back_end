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

 const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
 const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

 if (!supabaseUrl || !supabaseAnonKey) {
   throw new Error('Missing Supabase environment variables. Please check your .env.local file.')
 }

 export const supabase = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)