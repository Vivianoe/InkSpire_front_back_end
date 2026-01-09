'use client'

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react'
import { User, Session, AuthError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import { AuthModal as PerusallAuthModal } from '@/components/auth/PerusallAuthModal'
import { EmailConfirmationModal } from '@/components/auth/EmailConfirmationModal'
import { EmailConfirmedModal } from '@/components/auth/EmailConfirmedModal'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  showPerusallModal: boolean
  showEmailConfirmationModal: boolean
  showEmailConfirmedModal: boolean
  emailConfirmed: boolean
  coursesRefreshTrigger: number
  signIn: (email: string, password: string) => Promise<{ error?: AuthError }>
  signUp: (email: string, password: string, name: string) => Promise<{ error?: AuthError }>
  signOut: () => Promise<{ error?: AuthError }>
  closePerusallModal: () => void
  closeEmailConfirmationModal: () => void
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
  const [showPerusallModal, setShowPerusallModal] = useState(false)
  const [showEmailConfirmationModal, setShowEmailConfirmationModal] = useState(false)
  const [showEmailConfirmedModal, setShowEmailConfirmedModal] = useState(false)
  const [emailConfirmed, setEmailConfirmed] = useState(false)
  const [coursesRefreshTrigger, setCoursesRefreshTrigger] = useState(0)
  
  // Refs to track modal states without causing re-renders in localStorage checking
  const modalStateRef = useRef({
    showEmailConfirmedModal,
    showPerusallModal
  })
  
  // Update refs when modal states change
  useEffect(() => {
    modalStateRef.current = {
      showEmailConfirmedModal,
      showPerusallModal
    }
  }, [showEmailConfirmedModal, showPerusallModal])

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setSession(session)
      setUser(session?.user ?? null)

      // Initialize emailConfirmed based on actual session state
      if (session?.user) {
        setEmailConfirmed(session.user.email_confirmed_at !== null)
      }

      setLoading(false)
    }

    getInitialSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)

        // Detect email confirmation
        if (event === 'USER_UPDATED' && session?.user) {
          const currentConfirmationStatus = session.user.email_confirmed_at !== null
          const previouslyUnconfirmed = showEmailConfirmationModal  // Use modal state instead

          // If the modal is showing AND email is now confirmed, transition
          if (previouslyUnconfirmed && currentConfirmationStatus) {
            console.log('✓ Email confirmation detected - transitioning modals')
            setEmailConfirmed(true)
            setShowEmailConfirmationModal(false)
            setShowEmailConfirmedModal(true)
          }

          // Always sync the emailConfirmed state with actual session
          setEmailConfirmed(currentConfirmationStatus)
        }

        // Clear modals on sign out
        if (event === 'SIGNED_OUT') {
          setShowEmailConfirmationModal(false)
          setShowEmailConfirmedModal(false)
          setEmailConfirmed(false)
          setShowPerusallModal(false)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // Separate useEffect for localStorage signal detection to avoid infinite loops
  useEffect(() => {
    const checkEmailConfirmationSignal = async () => {
      const signal = localStorage.getItem('inkspire-email-confirmation-signal')
      if (signal) {
        try {
          const data = JSON.parse(signal)
          console.log('✓ Email confirmation signal detected:', data)
          
          // IMPORTANT: Only process if this is NOT the confirmation page
          const isConfirmationPage = window.location.pathname.includes('/auth/confirm')
          if (isConfirmationPage) {
            console.log('🚫 This is confirmation page, ignoring signal')
            return
          }
          
          // Add a small delay to ensure confirmation page has time to finish processing
          // This helps prevent race conditions
          await new Promise(resolve => setTimeout(resolve, 100))
          
          // Try to remove signal (only if still there)
          const remainingSignal = localStorage.getItem('inkspire-email-confirmation-signal')
          if (remainingSignal) {
            localStorage.removeItem('inkspire-email-confirmation-signal')
            console.log('🗑️ Removed signal after delay')
          }
          
          // Send acknowledgment
          localStorage.setItem('inkspire-email-confirmation-ack', JSON.stringify({
            timestamp: Date.now(),
            processedBy: window.location.pathname
          }))
          
          // Check if user is confirmed - get fresh session data
          const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser()
          
          if (userError) {
            console.error('Error checking user session:', userError)
            return
          }
          
          if (currentUser?.email_confirmed_at) {
            console.log('✓ User email confirmed, showing modal')
            
            // Show confirmed modal if not already showing (using refs to avoid re-renders)
            if (!modalStateRef.current.showEmailConfirmedModal && !modalStateRef.current.showPerusallModal) {
              console.log('✓ Showing EmailConfirmedModal from localStorage signal')
              setShowEmailConfirmedModal(true)
            }
          } else {
            console.log('⚠️ User email not yet confirmed, waiting for auth state change')
          }
        } catch (err) {
          console.error('Failed to parse confirmation signal:', err)
        }
      }
    }

    // Check on mount and less frequently to reduce race conditions
    checkEmailConfirmationSignal()
    const signalCheckInterval = setInterval(checkEmailConfirmationSignal, 2000) // Increased to 2 seconds

    return () => {
      clearInterval(signalCheckInterval)
    }
  }, [])

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

      // Set the session in Supabase client using tokens from backend
      // This allows the auth state listener and session management to work seamlessly
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      })

      if (sessionError) {
        console.error('❌ Session setup failed:', sessionError)
        return { error: sessionError }
      }

      // Check email confirmation status
      const { data: { user } } = await supabase.auth.getUser()

      if (!user?.email_confirmed_at) {
        // Email not confirmed - show confirmation waiting modal
        setEmailConfirmed(false)
        setShowEmailConfirmationModal(true)
      } else {
        setEmailConfirmed(true)
        // Don't auto-show Perusall modal on sign-in (only on signup)
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
      // console.log('✅ Signup successful:', data.user.email)

      // Only set session if we have tokens (confirmations disabled or already confirmed)
      if (data.access_token && data.refresh_token) {
        // Set the session in Supabase client using tokens from backend
        // This allows the auth state listener and session management to work seamlessly
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        })

        if (sessionError) {
          console.error('❌ Session setup failed:', sessionError)
          return { error: sessionError }
        }

        // Check email confirmation status
        const { data: { user } } = await supabase.auth.getUser()

        if (user?.email_confirmed_at) {
          // Email already confirmed (confirmations disabled or already confirmed)
          setEmailConfirmed(true)
          setShowPerusallModal(true)
        } else {
          // Email not confirmed - show confirmation waiting modal
          setEmailConfirmed(false)
          setShowEmailConfirmationModal(true)
        }
      } else {
        // No tokens = email confirmation required before session is created
        setEmailConfirmed(false)
        setShowEmailConfirmationModal(true)
      }

      // Session will be automatically detected by onAuthStateChange listener
      return { error: undefined }
    } catch (error) {
      console.error('❌ Signup catch error:', error)
      return { error: { message: String(error) } as AuthError }
    }
  }

  const closePerusallModal = () => {
    setShowPerusallModal(false)
  }

  const closeEmailConfirmationModal = () => {
    setShowEmailConfirmationModal(false)
  }

  const handleEmailConfirmed = () => {
    // Called when EmailConfirmedModal "Continue" is clicked
    setShowEmailConfirmedModal(false)
    setShowPerusallModal(true) // Now show Perusall integration
  }

  const resendConfirmationEmail = async () => {
    try {
      if (!user?.email) {
        return { error: { message: 'No email found' } as AuthError }
      }

      const response = await fetch('/api/users/resend-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email })
      })

      if (!response.ok) {
        const data = await response.json()
        return { error: { message: data.detail || 'Failed to resend email' } as AuthError }
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
    showPerusallModal,
    showEmailConfirmationModal,
    showEmailConfirmedModal,
    emailConfirmed,
    coursesRefreshTrigger,
    signIn,
    signUp,
    signOut,
    closePerusallModal,
    closeEmailConfirmationModal,
    handleEmailConfirmed,
    resendConfirmationEmail,
    triggerCoursesRefresh,
  }


  return (
    <AuthContext.Provider value={value}>
      {children}

      {/* Email Confirmation Waiting Modal */}
      <EmailConfirmationModal
        isOpen={showEmailConfirmationModal}
        onClose={closeEmailConfirmationModal}
        email={user?.email || null}
        allowClose={process.env.NODE_ENV === 'development'}
      />

      {/* Email Confirmed Success Modal */}
      <EmailConfirmedModal
        isOpen={showEmailConfirmedModal}
        onContinue={handleEmailConfirmed}
      />

      {/* Perusall Integration Modal */}
      <PerusallAuthModal
        isOpen={showPerusallModal}
        onClose={closePerusallModal}
      />
    </AuthContext.Provider>
  )
}