'use client'

import { useEffect, useState } from 'react'

interface EmailConfirmedModalProps {
  isOpen: boolean
  onContinue: () => void
}

export function EmailConfirmedModal({ isOpen, onContinue }: EmailConfirmedModalProps) {
  const [countdown, setCountdown] = useState(3)

  // Auto-continue after 3 seconds
  useEffect(() => {
    if (!isOpen) {
      setCountdown(3) // Reset countdown when modal closes
      return
    }

    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1)
      }, 1000)
      return () => clearTimeout(timer)
    } else {
      // Countdown reached 0, auto-continue
      onContinue()
    }
  }, [isOpen, countdown, onContinue])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
        <div className="text-center py-8">
          {/* Big green checkmark */}
          <div className="text-green-500 text-6xl mb-4 animate-bounce">✓</div>

          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Email Confirmed!
          </h3>

          <p className="text-gray-600 mb-6">
            Your email has been successfully confirmed.
          </p>

          <p className="text-sm text-gray-500 mb-4">
            Continuing to Perusall integration in {countdown}s...
          </p>

          {/* Manual continue button */}
          <button
            onClick={onContinue}
            className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
          >
            Continue Now
          </button>
        </div>
      </div>
    </div>
  )
}
