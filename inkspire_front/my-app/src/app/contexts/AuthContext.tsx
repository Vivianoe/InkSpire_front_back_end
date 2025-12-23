'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, Session, AuthError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase/client'
// import { useWelcomeDialog } from '../hooks/useWelcomeDialog'
// import { WelcomeDialog } from '../components/WelcomeDialog'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  // showWelcomeDialog: (userId?: string) => Promise<void>
  // dismissWelcomeDialog: () => void
  signIn: (email: string, password: string) => Promise<{ error?: AuthError }>
  signUp: (email: string, password: string, name: string) => Promise<{ error?: AuthError }>
  signOut: () => Promise<{ error?: AuthError }>
  // signInWithProvider: (provider: 'google') => Promise<{ error?: AuthError }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  // const welcomeDialog = useWelcomeDialog()

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    }

    getInitialSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)

        // // Handle sign-in success
        // if (event === 'SIGNED_IN' && session?.user) {
        //   console.log('User signed in:', session.user.email)
        // }

        // // Handle sign-out - clear any cached data
        // if (event === 'SIGNED_OUT') {
        //   console.log('User signed out')
        //   // Could clear any cached data here
        // }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  })

  const signIn = async (email: string, password: string) => {
    try {
      const response = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      if (!response.ok) {
        const data = await response.json()
        console.error('❌ Login failed:', data.detail)
        return { error: { message: data.detail || 'Login failed' } as AuthError }
      }

      const data = await response.json()
      // console.log('✅ Login successful:', data.user.email)

      // Set the session in Supabase client using the access token from backend
      // This allows the auth state listener and session management to work seamlessly
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.access_token, // Backend doesn't provide refresh token yet
      })

      if (sessionError) {
        console.error('❌ Session setup failed:', sessionError)
        return { error: sessionError }
      }

      // Session will be automatically detected by onAuthStateChange listener
      return { error: undefined }
    } catch (error) {
      console.error('❌ Login catch error:', error)
      return { error: { message: String(error) } as AuthError }
    }
  }

  const signUp = async (email: string, password: string, name: string) => {
    try {
      const response = await fetch('/api/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name })
      })

      if (!response.ok) {
        const data = await response.json()
        console.error('❌ Registration failed:', data.detail)
        return { error: { message: data.detail || 'Registration failed' } as AuthError }
      }

      const data = await response.json()
      // console.log('✅ Signup successful:', data.email)

      // Session will be automatically detected by onAuthStateChange listener
      return { error: undefined }
    } catch (error) {
      console.error('❌ Signup catch error:', error)
      return { error: { message: String(error) } as AuthError }
    }
  }

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      return { error: error || undefined }
    } catch (error) {
      return { error: error as AuthError }
    }
  }

  // const signInWithProvider = async (provider: 'google') => {
  //   try {
  //     const { error } = await supabase.auth.signInWithOAuth({
  //       provider,
  //       options: {
  //         redirectTo: `${window.location.origin}/auth/callback`
  //       }
  //     })
  //     return { error: error || undefined }
  //   } catch (error) {
  //     return { error: error as AuthError }
  //   }
  // }

  const value: AuthContextType = {
    user,
    session,
    loading,
    // showWelcomeDialog: welcomeDialog.show,
    // dismissWelcomeDialog: welcomeDialog.dismiss,
    signIn,
    signUp,
    signOut,
    // signInWithProvider,
  }


  return (
    <AuthContext.Provider value={value}>
      {children}
      {/* <WelcomeDialog
        isOpen={welcomeDialog.isOpen}
        onDismiss={welcomeDialog.dismiss}
      /> */}
    </AuthContext.Provider>
  )
}