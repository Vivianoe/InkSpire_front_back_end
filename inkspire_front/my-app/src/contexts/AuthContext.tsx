'use client'

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react'
import { User, Session, AuthError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import { AuthModal as PerusallAuthModal } from '@/components/auth/PerusallAuthModal'
import { EmailConfirmationModal } from '@/components/auth/EmailConfirmationModal'
import { EmailConfirmedModal } from '@/components/auth/EmailConfirmedModal'
import { useEmailConfirmation } from '@/hooks/useEmailConfirmation'
import { getCurrentUser } from '@/lib/utils/authUtils'
import { resendConfirmationEmail } from '@/lib/utils/emailUtils'

/**
 * Modal flow states - enforces sequential progression
 * Replaces 5 separate boolean flags for cleaner state management
 */
export enum ModalFlow {
  None = 'none',
  EmailConfirmation = 'email_confirmation',
  EmailConfirmed = 'email_confirmed',
  PerusallSetup = 'perusall_setup'
}

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  currentModalFlow: ModalFlow
  coursesRefreshTrigger: number
  pendingEmail: string | null
  signIn: (email: string, password: string) => Promise<{ error?: AuthError }>
  signUp: (email: string, password: string, name: string) => Promise<{ error?: AuthError }>
  signOut: () => Promise<{ error?: AuthError }>
  closeModals: () => void
  handleEmailConfirmed: () => void
  resendConfirmationEmail: () => Promise<{ error?: AuthError }>
  triggerCoursesRefresh: () => void
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
  const [currentModalFlow, setCurrentModalFlow] = useState<ModalFlow>(ModalFlow.None)
  const currentModalFlowRef = useRef<ModalFlow>(ModalFlow.None)
  const [coursesRefreshTrigger, setCoursesRefreshTrigger] = useState(0)
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const isTestingAuth =
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_AUTH_TESTING === 'true'

  // Keep ref in sync with state for use in subscription callbacks (avoids stale closure)
  useEffect(() => {
    currentModalFlowRef.current = currentModalFlow
  }, [currentModalFlow])

  // Email confirmation detection hook
  // Replaces all polling and localStorage detection logic
  useEmailConfirmation({
    enabled: currentModalFlow === ModalFlow.EmailConfirmation,
    onConfirmed: () => {
      setCurrentModalFlow(ModalFlow.EmailConfirmed)
    }
  })

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

        // Detect email confirmation via SIGNED_IN event
        // (happens when session is created with email already confirmed after email verification)
        if (event === 'SIGNED_IN' && session?.user) {
          const isConfirmed = session.user.email_confirmed_at !== null
          const waitingForConfirmation = currentModalFlowRef.current === ModalFlow.EmailConfirmation
          
          if (waitingForConfirmation && isConfirmed) {
            setCurrentModalFlow(ModalFlow.EmailConfirmed)
            setPendingEmail(null)
          }
        }

        // Detect email confirmation via USER_UPDATED event
        // (happens when email is confirmed during an existing session)
        if (event === 'USER_UPDATED' && session?.user) {
          const isConfirmed = session.user.email_confirmed_at !== null
          const waitingForConfirmation = currentModalFlowRef.current === ModalFlow.EmailConfirmation

          if (waitingForConfirmation && isConfirmed) {
            // Email was just confirmed - transition to success modal
            setCurrentModalFlow(ModalFlow.EmailConfirmed)
            setPendingEmail(null)
          } else {
            console.log('❌ NOT transitioning because:', {
              waitingForConfirmation,
              isConfirmed
            })
          }
        }

        // Clear all modals and state on sign out
        // EXCEPT when we're waiting for email confirmation (session recreation during email verification)
        if (event === 'SIGNED_OUT') {
          if (currentModalFlowRef.current !== ModalFlow.EmailConfirmation) {
            setCurrentModalFlow(ModalFlow.None)
            setPendingEmail(null)
          } else {
            console.log('⏸️ SIGNED_OUT during email confirmation - preserving modal state')
          }
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])  // Empty array - only run once on mount, avoids subscription churn

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

      // Set the session in Supabase client using tokens from backend
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      })

      if (sessionError) {
        console.error('❌ Session setup failed:', sessionError)
        return { error: sessionError }
      }

      // Check email confirmation status using utility
      const { isConfirmed } = await getCurrentUser()

      if (!isConfirmed && !isTestingAuth) {
        // Email not confirmed - show confirmation waiting modal
        setCurrentModalFlow(ModalFlow.EmailConfirmation)
      }
      // If confirmed, don't auto-show Perusall modal on sign-in (only on signup)

      // Session will be automatically detected by onAuthStateChange listener
      return { error: undefined }
    } catch (error) {
      console.error('❌ Login catch error:', error)
      return { error: { message: String(error) } as AuthError }
    }
  }

  const signUp = async (email: string, password: string, name: string) => {
    try {
      // Store the email for the confirmation modal
      setPendingEmail(email)

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

      // Only set session if we have tokens (confirmations disabled or already confirmed)
      if (data.access_token && data.refresh_token) {
        // Set the session in Supabase client using tokens from backend
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        })

        if (sessionError) {
          console.error('❌ Session setup failed:', sessionError)
          return { error: sessionError }
        }

        // Check email confirmation status using utility
        const { isConfirmed } = await getCurrentUser()

        // Set modal flow based on confirmation status
        setCurrentModalFlow(
          isConfirmed || isTestingAuth ? ModalFlow.PerusallSetup : ModalFlow.EmailConfirmation
        )
      } else {
        // No tokens = email confirmation required before session is created
        if (!isTestingAuth) {
          setCurrentModalFlow(ModalFlow.EmailConfirmation)
        }
      }

      // Session will be automatically detected by onAuthStateChange listener
      return { error: undefined }
    } catch (error) {
      console.error('❌ Signup catch error:', error)
      return { error: { message: String(error) } as AuthError }
    }
  }

  /**
   * Close all modals
   */
  const closeModals = () => {
    setCurrentModalFlow(ModalFlow.None)
  }

  /**
   * Handle email confirmed - transition to Perusall setup
   * Called when EmailConfirmedModal "Continue" is clicked
   */
  const handleEmailConfirmed = () => {
    setCurrentModalFlow(ModalFlow.PerusallSetup)
  }

  /**
   * Resend confirmation email using utility
   */
  const handleResendConfirmationEmail = async () => {
    try {
      if (!user?.email && !pendingEmail) {
        return { error: { message: 'No email found' } as AuthError }
      }

      const email = user?.email || pendingEmail!
      const result = await resendConfirmationEmail(email)

      if (!result.success) {
        return { error: { message: result.error || 'Failed to resend email' } as AuthError }
      }

      return { error: undefined }
    } catch (error) {
      return { error: { message: String(error) } as AuthError }
    }
  }

  const triggerCoursesRefresh = () => {
    setCoursesRefreshTrigger(prev => prev + 1)
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
    currentModalFlow,
    coursesRefreshTrigger,
    pendingEmail,
    signIn,
    signUp,
    signOut,
    closeModals,
    handleEmailConfirmed,
    resendConfirmationEmail: handleResendConfirmationEmail,
    triggerCoursesRefresh,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}

      {/* Email Confirmation Waiting Modal */}
      <EmailConfirmationModal
        isOpen={currentModalFlow === ModalFlow.EmailConfirmation}
        onClose={closeModals}
        email={user?.email || pendingEmail || null}
        allowClose={process.env.NODE_ENV === 'development'}
      />

      {/* Email Confirmed Success Modal */}
      <EmailConfirmedModal
        isOpen={currentModalFlow === ModalFlow.EmailConfirmed}
        onContinue={handleEmailConfirmed}
      />

      {/* Perusall Integration Modal */}
      <PerusallAuthModal
        isOpen={currentModalFlow === ModalFlow.PerusallSetup}
        onClose={closeModals}
      />
    </AuthContext.Provider>
  )
}
