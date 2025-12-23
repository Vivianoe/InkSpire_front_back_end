'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import Image from 'next/image'
import { ChevronDownIcon } from '@heroicons/react/24/outline'

interface UserProfileDropdownProps {
  /**
   * Additional CSS classes to apply to the root container
   */
  className?: string
  /**
   * Whether to show the user name text next to the avatar
   * Defaults to true, but can be set to false for compact display
   */
  showUserName?: boolean
  /**
   * Position of the dropdown relative to the trigger button
   * Defaults to 'bottom-left'
   */
  dropdownPosition?: 'bottom-left' | 'top-left' | 'bottom-right' | 'top-right'
}

export function UserProfileDropdown({ 
  className = '', 
  showUserName = true,
  dropdownPosition = 'bottom-left' 
}: UserProfileDropdownProps) {
  const { user, signOut, loading } = useAuth()
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
      setIsDropdownOpen(false)
    }
  }, [])

  useEffect(() => {
    // Only add event listener when dropdown is open to prevent unnecessary event handling
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [isDropdownOpen, handleClickOutside])

  // Don't render if loading or no user
  if (loading || !user) {
    return null
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      setIsDropdownOpen(false)
    } catch (error) {
      console.error('Sign out failed:', error)
      // Keep dropdown open on error so user can retry
      // In a production app, you might want to show a toast notification
    }
  }

  const getUserDisplayName = () => {
    if (user.user_metadata?.display_name) {
      return user.user_metadata.display_name
    }
    if (user.user_metadata?.full_name) {
      return user.user_metadata.full_name
    }
    if (user.user_metadata?.name) {
      return user.user_metadata.name
    }
    if (user.email) {
      return user.email.split('@')[0]
    }
    return 'User'
  }

  const getUserAvatarUrl = () => {
    const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture
    return validateAvatarUrl(avatarUrl)
  }

  const validateAvatarUrl = (url: string | undefined): string | null => {
    if (!url) return null

    try {
      const parsedUrl = new URL(url)
      
      // Only allow HTTPS URLs for security
      if (parsedUrl.protocol !== 'https:') {
        return null
      }

      // Allowlist of trusted avatar domains
      const trustedDomains = [
        'lh3.googleusercontent.com', // Google
        'avatars.githubusercontent.com', // GitHub
      ]

      // Check if domain is in our allowlist
      if (!trustedDomains.includes(parsedUrl.hostname)) {
        return null
      }

      return url
    } catch {
      // Invalid URL format
      return null
    }
  }

  const getInitials = () => {
    const name = getUserDisplayName()
    return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  }

  const getDropdownPositionClasses = () => {
    switch (dropdownPosition) {
      case 'top-left':
        return 'left-0 top-full mt-2'
      case 'bottom-right':
        return 'right-0 bottom-full mb-2'
      case 'top-right':
        return 'right-0 top-full mt-2'
      case 'bottom-left':
      default:
        return 'left-0 bottom-full mb-2'
    }
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-200 cursor-pointer"
        aria-label={`${getUserDisplayName()} profile menu`}
        aria-expanded={isDropdownOpen}
        aria-haspopup="menu"
        style={{pointerEvents: 'all'}}
      >
        <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center overflow-hidden">
          {getUserAvatarUrl() ? (
            <Image
              src={getUserAvatarUrl()!}
              alt={getUserDisplayName()}
              width={24}
              height={24}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-white text-sm font-medium">
              {getInitials()}
            </span>
          )}
        </div>
        {showUserName && (
          <span className="text-sm font-medium text-gray-700 hidden sm:block">
            {getUserDisplayName()}
          </span>
        )}
        <ChevronDownIcon className="w-5 h-5 text-black" />
      </button>

      {isDropdownOpen && (
        <div 
          className={`absolute ${getDropdownPositionClasses()} w-64 bg-white rounded-lg shadow-lg border z-50`}
          role="menu"
          aria-orientation="vertical"
        >
          <div className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center overflow-hidden">
                {getUserAvatarUrl() ? (
                  <Image
                    src={getUserAvatarUrl()!}
                    alt={getUserDisplayName()}
                    width={32}
                    height={32}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-white font-medium">
                    {getInitials()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {getUserDisplayName()}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {user.email}
                </p>
              </div>
            </div>
          </div>

          <div className="px-4 pb-4 border-b">
            <p className="text-xs text-gray-500">
              Signed in via {user.app_metadata?.provider || 'email'}
            </p>
          </div>

          <div className="p-2">
            <button
              onClick={handleSignOut}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md flex items-center space-x-2 cursor-pointer"
              role="menuitem"
              style={{ pointerEvents: 'all' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}