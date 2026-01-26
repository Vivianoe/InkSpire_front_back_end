'use client'

interface EmailConfirmedModalProps {
  isOpen: boolean
  requiresReauth?: boolean
  onContinue: () => void
}

export const EmailConfirmedModal = ({
  isOpen,
  requiresReauth = false,
  onContinue
}: EmailConfirmedModalProps) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
        <div className="text-center py-8">
          {/* Big green checkmark */}
          <div className="text-green-500 text-6xl mb-4">✓</div>

          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Email Confirmed!
          </h3>

          <p className="text-gray-600 mb-6">
            {requiresReauth
              ? 'Your email is confirmed. Please sign in again to continue.'
              : 'Your email has been successfully confirmed.'}
          </p>

          {/* Manual proceed button */}
          <button
            onClick={onContinue}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
          >
            {requiresReauth ? 'Sign In Again' : 'Continue to Perusall Setup →'}
          </button>
        </div>
      </div>
    </div>
  )
}
