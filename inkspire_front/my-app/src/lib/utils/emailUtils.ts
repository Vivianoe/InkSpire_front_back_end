/**
 * Email utility functions for confirmation and resend operations
 * Consolidates resend email logic from 3 locations
 */

import { useState, useEffect } from 'react'
import { RESEND_COOLDOWN_SECONDS } from '@/lib/constants/auth'

/**
 * Result of resend email operation
 */
export interface ResendEmailResult {
  success: boolean
  error: string | null
}

/**
 * Resend confirmation email
 *
 * Consolidates resend logic from 3 locations:
 * - AuthContext.tsx:317-338
 * - EmailConfirmationModal.tsx:121-146
 * - confirm/page.tsx:107-130
 *
 * @param email - Email address to resend confirmation to
 * @returns Result indicating success or error
 *
 * @example
 * const result = await resendConfirmationEmail('user@example.com')
 * if (result.success) {
 *   // Show success message
 * } else {
 *   // Show error: result.error
 * }
 */
export async function resendConfirmationEmail(email: string): Promise<ResendEmailResult> {
  try {
    const response = await fetch('/api/users/resend-confirmation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    })

    if (!response.ok) {
      const data = await response.json()
      return { success: false, error: data.detail || 'Failed to resend email' }
    }

    return { success: true, error: null }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An error occurred'
    }
  }
}

/**
 * Hook for managing resend email with cooldown
 *
 * Consolidates cooldown logic and state management from modal and confirm page
 * Provides a complete interface for resend email functionality
 *
 * @param email - Email address (null if not available)
 * @returns Resend state and actions
 *
 * @example
 * const { resend, resending, resendSuccess, resendCooldown, error, canResend } = useResendEmail(email)
 *
 * return (
 *   <button onClick={resend} disabled={!canResend}>
 *     {resending ? 'Sending...' : resendCooldown > 0 ? `Wait ${resendCooldown}s` : 'Resend Email'}
 *   </button>
 * )
 */
export function useResendEmail(email: string | null) {
  const [resending, setResending] = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Cooldown timer - decrements every second
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown(resendCooldown - 1)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [resendCooldown])

  /**
   * Trigger resend email operation
   * Handles cooldown and error states automatically
   */
  const resend = async () => {
    if (!email || resendCooldown > 0) return

    setResending(true)
    setError(null)
    setResendSuccess(false)

    const result = await resendConfirmationEmail(email)

    if (result.success) {
      setResendSuccess(true)
      setResendCooldown(RESEND_COOLDOWN_SECONDS)
    } else {
      setError(result.error)
    }

    setResending(false)
  }

  /**
   * Reset success and error states
   * Useful when modal closes or component unmounts
   */
  const reset = () => {
    setResendSuccess(false)
    setError(null)
  }

  return {
    resend,
    reset,
    resending,
    resendSuccess,
    resendCooldown,
    error,
    canResend: !resending && resendCooldown === 0 && !!email
  }
}
