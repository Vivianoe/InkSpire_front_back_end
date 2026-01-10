'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { extractTokensFromURL, setSessionFromTokens, waitForSession } from '@/lib/utils/authUtils'
import { resendConfirmationEmail } from '@/lib/utils/emailUtils'
import {
  EMAIL_CONFIRMATION_CHANNEL,
  LEGACY_CONFIRMATION_SIGNAL_KEY,
  CONFIRMATION_PAGE_CLEANUP_DELAY
} from '@/lib/constants/auth'

export default function ConfirmEmailPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const confirmEmail = async () => {
      try {
        // Extract tokens from URL using utility (handles both query and hash params)
        const tokens = extractTokensFromURL(searchParams)

        // Check for errors first
        if (tokens.error) {
          console.error('Confirmation error from URL:', tokens.error, tokens.errorDescription)
          setStatus('error')
          setErrorMessage(tokens.errorDescription || tokens.error || 'Email confirmation failed.')
          return
        }

        // Scenario A: Tokens in URL - set session explicitly
        if (tokens.accessToken && tokens.refreshToken) {
          const { error: sessionError } = await setSessionFromTokens(
            tokens.accessToken,
            tokens.refreshToken
          )

          if (sessionError) {
            console.error('Session setup error:', sessionError)
            setStatus('error')
            setErrorMessage(sessionError.message || 'Failed to set session.')
            return
          }

          // Wait for session to be fully established
          await waitForSession(500)
        } else {
          // Scenario B: No tokens - Supabase may have auto-set session via cookie
          await waitForSession(1000)
        }

        // Check if user session exists and email is confirmed
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
        setStatus('success')

        // Broadcast to other tabs using BroadcastChannel (with fallback)
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
          // Modern approach: BroadcastChannel
          const channel = new BroadcastChannel(EMAIL_CONFIRMATION_CHANNEL)
          channel.postMessage({
            type: 'email-confirmed',
            timestamp: Date.now(),
            userId: user.id,
            email: user.email || ''
          })
          channel.close()
        } else {
          // Fallback: localStorage signal for older browsers
          localStorage.setItem(LEGACY_CONFIRMATION_SIGNAL_KEY, JSON.stringify({
            timestamp: Date.now(),
            userId: user.id,
            email: user.email || ''
          }))
        }

        // Brief delay to ensure signal completes
        await waitForSession(CONFIRMATION_PAGE_CLEANUP_DELAY)
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

      const result = await resendConfirmationEmail(user.email)

      if (result.success) {
        setErrorMessage('Confirmation email sent! Please check your inbox.')
      } else {
        setErrorMessage(result.error || 'Failed to resend email')
      }
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
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Email Confirmed!
            </h2>
            <div className="mb-4">
              <p className="text-gray-600"> 
                Please close this tab and return to your original tab to continue the sign up process.
              </p>
            </div>
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
