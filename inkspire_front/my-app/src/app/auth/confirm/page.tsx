'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'

export default function ConfirmEmailPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'success_closing' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const confirmEmail = async () => {
      try {
        // Check for error parameters first
        const error = searchParams.get('error')
        const errorDescription = searchParams.get('error_description')

        if (error) {
          console.error('Confirmation error from URL:', error, errorDescription)
          setStatus('error')
          setErrorMessage(errorDescription || error || 'Email confirmation failed.')
          return
        }

        // Check for tokens in URL (either query params or hash params)
        // Query params: ?access_token=...&refresh_token=...
        let accessToken = searchParams.get('access_token')
        let refreshToken = searchParams.get('refresh_token')

        // Hash params: #access_token=...&refresh_token=...
        if (!accessToken && window.location.hash) {
          const hashParams = new URLSearchParams(window.location.hash.substring(1))
          accessToken = hashParams.get('access_token')
          refreshToken = hashParams.get('refresh_token')
        }

        // Scenario A: Tokens in URL - set session explicitly
        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          })

          if (sessionError) {
            console.error('Session setup error:', sessionError)
            setStatus('error')
            setErrorMessage(sessionError.message || 'Failed to set session.')
            return
          }

          // Wait for session to be fully established in Supabase client
          await new Promise(resolve => setTimeout(resolve, 500))
        } else {
          // Scenario B: No tokens in URL - Supabase may have auto-set session via cookie
          // Wait a moment for session to be initialized
          await new Promise(resolve => setTimeout(resolve, 1000))
        }

        // Now check if user session exists and email is confirmed
        const { data: { user }, error: userError } = await supabase.auth.getUser()

        if (userError) {
          console.error('Error getting user:', userError)
          setStatus('error')
          setErrorMessage(userError.message || 'Failed to verify email confirmation.')
          return
        }

        if (!user) {
          setStatus('error')
          setErrorMessage('No user session found. The confirmation link may have expired.')
          return
        }

        if (!user.email_confirmed_at) {
          setStatus('error')
          setErrorMessage('Email confirmation is still pending. Please try again.')
          return
        }

        // Success! Email is confirmed
        console.log('✓ Email confirmed successfully:', user.email)
        setStatus('success')

        // Write localStorage signal for original tab
        const confirmationSignal = {
          timestamp: Date.now(),
          userId: user.id,
          email: user.email || ''
        }
        localStorage.setItem('inkspire-email-confirmation-signal', JSON.stringify(confirmationSignal))

        // Brief delay to ensure localStorage write completes
        await new Promise(resolve => setTimeout(resolve, 500))

        // Always attempt to close the tab
        setTimeout(() => {
          window.close()

          // If we're still here after 500ms, the close failed
          setTimeout(() => {
            const ackSignal = localStorage.getItem('inkspire-email-confirmation-ack')

            if (ackSignal) {
              // Original tab exists and acknowledged - show message
              setStatus('success_closing')
              // Try closing again after 2s
              setTimeout(() => window.close(), 2000)
            } else {
              // Original tab is gone - redirect to signin
              localStorage.setItem('inkspire-email-confirmed-redirect', 'true')
              localStorage.removeItem('inkspire-email-confirmation-signal')
              router.push('/signin')
            }
          }, 500)
        }, 1000) // Show success message for 1s first

      } catch (err) {
        console.error('Confirmation error:', err)
        setStatus('error')
        setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred')
      }
    }

    confirmEmail()
  }, [router, searchParams]) // searchParams is needed for query parameter access

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
              This tab will close automatically in a moment...
            </p>
          </div>
        )}

        {status === 'success_closing' && (
          <div className="text-center">
            <div className="text-green-500 text-6xl mb-4">✓</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Email Confirmed!
            </h2>
            <p className="text-gray-600 mb-4">
              You can close this tab now.
            </p>
            <p className="text-sm text-gray-500">
              This tab will close automatically in a moment...
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
