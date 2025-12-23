'use client'

import { ReactNode, useState, useEffect } from 'react'
import { useAuth } from '@/app/contexts/AuthContext'
import { AuthModal } from './AuthModal'

interface AuthGuardProps {
  children: ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading } = useAuth()
  const [showAuthModal, setShowAuthModal] = useState(false)

  useEffect(() => {
    // Reset modal when loading
    if (loading) {
      setShowAuthModal(false)
      return
    }

    // Hide modal if user is authenticated
    if (user) {
      setShowAuthModal(false)
      return
    }

    // User is not authenticated - show modal after 2-second delay
    const timer = setTimeout(() => {
      setShowAuthModal(true)
    }, 2000)

    // Cleanup timer on unmount or dependency change
    return () => clearTimeout(timer)
  }, [user, loading])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600"> Loading InkSpire...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />

      {children}
    </>
  )
}