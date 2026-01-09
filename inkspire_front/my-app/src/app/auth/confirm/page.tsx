'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

export default function ConfirmEmailPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const confirmEmail = async () => {
      try {
        // Supabase automatically handles the token verification when this page loads
        // because the URL contains the confirmation token parameters
        // We just need to check if the user is now confirmed

        // Wait a moment for Supabase to process the confirmation
        await new Promise(resolve => setTimeout(resolve, 1000))

        // Get the current user and check confirmation status
        const { data: { user }, error } = await supabase.auth.getUser()

        if (error) {
          console.error('Error getting user:', error)
          setStatus('error')
          setErrorMessage(error.message || 'Failed to verify email confirmation')
          return
        }

        if (!user) {
          setStatus('error')
          setErrorMessage('No user session found. Please try signing in again.')
          return
        }

        if (user.email_confirmed_at) {
          // Email is confirmed!
          setStatus('success')

          // The AuthContext's onAuthStateChange listener will detect this change
          // and handle showing the EmailConfirmedModal
          // After a brief delay, redirect to home
          setTimeout(() => {
            router.push('/')
          }, 500)
        } else {
          setStatus('error')
          setErrorMessage('Email confirmation failed. The link may have expired.')
        }
      } catch (err) {
        console.error('Confirmation error:', err)
        setStatus('error')
        setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred')
      }
    }

    confirmEmail()
  }, [router, searchParams])

  const handleResend = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) {
        setErrorMessage('No email found. Please sign in again.')
        return
      }

      const response = await fetch('/api/users/resend-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.detail || 'Failed to resend email')
      }

      setErrorMessage('Confirmation email sent! Please check your inbox.')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to resend email')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        {status === 'loading' && (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Confirming Your Email
            </h2>
            <p className="text-gray-600">
              Please wait while we verify your email address...
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center">
            <div className="text-green-500 text-6xl mb-4">✓</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Email Confirmed!
            </h2>
            <p className="text-gray-600">
              Redirecting you to the dashboard...
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center">
            <div className="text-red-500 text-6xl mb-4">✕</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Confirmation Failed
            </h2>
            <p className="text-gray-600 mb-6">
              {errorMessage}
            </p>

            <div className="space-y-3">
              <button
                onClick={handleResend}
                className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
              >
                Resend Confirmation Email
              </button>

              <button
                onClick={() => router.push('/')}
                className="w-full py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
              >
                Go to Home
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
