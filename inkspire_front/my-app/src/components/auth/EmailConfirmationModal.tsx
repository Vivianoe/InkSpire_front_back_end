'use client'

import { useEffect } from 'react'
import { useResendEmail } from '@/lib/utils/emailUtils'

interface EmailConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  email: string | null
  allowClose?: boolean
}

export function EmailConfirmationModal({
  isOpen,
  onClose,
  email,
  allowClose = false
}: EmailConfirmationModalProps) {
  // Use resend email hook with cooldown management
  const { resend, reset, resending, resendSuccess, resendCooldown, error, canResend } = useResendEmail(email)

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      reset()
    }
  }, [isOpen, reset])

  if (!isOpen) return null

  return (
    <div className={'fixed inset-0 bg-black flex items-center justify-center z-[9999]'}>
      <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            Check Your Email
          </h2>
          {/* Show close button if allowClose is true OR in development mode */}
          {(allowClose || process.env.NODE_ENV === 'development') && (
            <button
              onClick={onClose}
              className="text-2xl text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              ×
            </button>
          )}
        </div>

        <div className="text-center mb-6">
          {/* Email icon */}
          <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 text-blue-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>

          <p className="text-gray-700 mb-2">
            We've sent a confirmation email to:
          </p>
          <p className="font-semibold text-gray-900 mb-4">
            {email}
          </p>
          <p className="text-gray-600 mb-6">
            Click the link in the email to confirm your account and continue to Perusall integration.
          </p>
        </div>

        {/* Resend button */}
        <div className="mb-4">
          <button
            onClick={resend}
            disabled={!canResend}
            className="w-full py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {resending ? (
              'Sending...'
            ) : resendCooldown > 0 ? (
              `Resend in ${resendCooldown}s`
            ) : (
              'Resend Email'
            )}
          </button>
        </div>

        {/* Success message */}
        {resendSuccess && (
          <div className="text-green-600 text-sm bg-green-50 p-3 rounded mb-4">
            ✓ Confirmation email sent! Check your inbox.
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="text-red-600 text-sm bg-red-50 p-3 rounded mb-4">
            {error}
          </div>
        )}

        <p className="text-xs text-gray-500 text-center mt-6">
          Didn't receive an email? <br/> Check your spam folder or click "Resend Email" above.
        </p>
        
        {/* Development mode helper */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
            <p className="text-sm text-yellow-800 mb-2">
              <strong>Development Mode</strong>
            </p>
            <p className="text-xs text-yellow-700 mb-2">
              Check Mailpit for confirmation email:
            </p>
            <a
              href="http://127.0.0.1:54324"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline text-sm hover:text-blue-800"
            >
              Open Mailpit Mail Server →
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
