/**
 * Email confirmation detection hook
 * Single source of truth for email confirmation status
 *
 * Replaces 3 separate detection mechanisms:
 * - AuthContext.tsx:128-192 (localStorage polling)
 * - EmailConfirmationModal.tsx:25-37 (session polling)
 * - EmailConfirmationModal.tsx:40-101 (storage event listeners)
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { checkAndRefreshSession } from '@/lib/utils/authUtils'
import {
  EMAIL_CONFIRMATION_CHANNEL,
  CONFIRMATION_POLL_INTERVAL,
  LEGACY_CONFIRMATION_SIGNAL_KEY,
  LEGACY_CONFIRMATION_ACK_KEY
} from '@/lib/constants/auth'

/**
 * Configuration options for email confirmation detection
 */
interface UseEmailConfirmationOptions {
  /**
   * Whether to actively check for confirmation
   * Set to false to pause detection (e.g., when modal is closed)
   */
  enabled: boolean

  /**
   * Callback when email confirmation is detected
   * Called once when confirmation status changes from false to true
   */
  onConfirmed?: () => void

  /**
   * Override default polling interval (in milliseconds)
   * Default: 5000ms (5 seconds)
   */
  pollingInterval?: number
}

/**
 * Return value from useEmailConfirmation hook
 */
interface UseEmailConfirmationReturn {
  /**
   * Whether email is confirmed
   * Updates automatically via polling and cross-tab sync
   */
  isConfirmed: boolean

  /**
   * Whether currently checking confirmation status
   * Useful for showing loading states
   */
  isChecking: boolean

  /**
   * Error message if check failed
   */
  error: string | null

  /**
   * Manually trigger a confirmation check
   * Useful for immediate checking after user action
   */
  checkNow: () => Promise<void>
}

/**
 * Hook for detecting email confirmation with cross-tab synchronization
 *
 * Features:
 * - Automatic polling at configurable interval
 * - Cross-tab sync using BroadcastChannel API (with localStorage fallback)
 * - Proper resource cleanup on unmount
 * - Manual trigger capability
 * - Type-safe with comprehensive error handling
 *
 * @param options - Configuration options
 * @returns Confirmation state and actions
 *
 * @example
 * // Basic usage
 * const { isConfirmed, isChecking } = useEmailConfirmation({
 *   enabled: showConfirmationModal,
 *   onConfirmed: () => setShowSuccessModal(true)
 * })
 *
 * @example
 * // With manual trigger
 * const { checkNow } = useEmailConfirmation({
 *   enabled: true,
 *   onConfirmed: handleConfirmed
 * })
 * // Later...
 * await checkNow() // Force immediate check
 */
export function useEmailConfirmation({
  enabled,
  onConfirmed,
  pollingInterval = CONFIRMATION_POLL_INTERVAL
}: UseEmailConfirmationOptions): UseEmailConfirmationReturn {
  const [isConfirmed, setIsConfirmed] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Refs to avoid re-creating callbacks on every render
  const broadcastChannel = useRef<BroadcastChannel | null>(null)
  const pollInterval = useRef<NodeJS.Timeout | null>(null)
  const onConfirmedRef = useRef(onConfirmed)

  // Keep callback ref updated without triggering re-renders
  useEffect(() => {
    onConfirmedRef.current = onConfirmed
  }, [onConfirmed])

  /**
   * Check confirmation status by refreshing session
   * This is the core detection logic used by both polling and manual triggers
   */
  const checkConfirmation = useCallback(async () => {
    if (!enabled) return

    setIsChecking(true)
    setError(null)

    try {
      const result = await checkAndRefreshSession()

      if (result.error) {
        setError(result.error.message)
        return
      }

      // Only trigger callback on transition from unconfirmed → confirmed
      if (result.isConfirmed && !isConfirmed) {
        setIsConfirmed(true)
        onConfirmedRef.current?.()

        // Broadcast to other tabs using BroadcastChannel
        if (broadcastChannel.current) {
          broadcastChannel.current.postMessage({
            type: 'email-confirmed',
            timestamp: Date.now()
          })
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Confirmation check failed')
    } finally {
      setIsChecking(false)
    }
  }, [enabled, isConfirmed])

  /**
   * Setup cross-tab synchronization
   * Uses BroadcastChannel if available, falls back to localStorage events
   */
  useEffect(() => {
    if (!enabled) return

    // Check if BroadcastChannel is supported
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      // Modern approach: BroadcastChannel API
      broadcastChannel.current = new BroadcastChannel(EMAIL_CONFIRMATION_CHANNEL)

      broadcastChannel.current.onmessage = (event) => {
        // Only process if we're not already confirmed
        if (event.data.type === 'email-confirmed' && !isConfirmed) {
          setIsConfirmed(true)
          onConfirmedRef.current?.()
        }
      }

      return () => {
        broadcastChannel.current?.close()
        broadcastChannel.current = null
      }
    } else {
      // Fallback: localStorage events for older browsers
      const handleStorageEvent = (e: StorageEvent) => {
        if (e.key === LEGACY_CONFIRMATION_SIGNAL_KEY && e.newValue && !isConfirmed) {
          try {
            // Clean up signal immediately
            localStorage.removeItem(LEGACY_CONFIRMATION_SIGNAL_KEY)

            // Send acknowledgment
            localStorage.setItem(LEGACY_CONFIRMATION_ACK_KEY, JSON.stringify({
              timestamp: Date.now()
            }))

            // Trigger confirmation check
            checkConfirmation()
          } catch (err) {
            console.error('Error handling legacy confirmation signal:', err)
          }
        }
      }

      window.addEventListener('storage', handleStorageEvent)
      return () => window.removeEventListener('storage', handleStorageEvent)
    }
  }, [enabled, isConfirmed, checkConfirmation])

  /**
   * Setup polling for confirmation status
   * Only runs when enabled and not yet confirmed
   */
  useEffect(() => {
    // Stop polling if disabled or already confirmed
    if (!enabled || isConfirmed) {
      if (pollInterval.current) {
        clearInterval(pollInterval.current)
        pollInterval.current = null
      }
      return
    }

    // Initial check immediately
    checkConfirmation()

    // Setup polling interval
    pollInterval.current = setInterval(checkConfirmation, pollingInterval)

    // Cleanup on unmount or when dependencies change
    return () => {
      if (pollInterval.current) {
        clearInterval(pollInterval.current)
        pollInterval.current = null
      }
    }
  }, [enabled, isConfirmed, checkConfirmation, pollingInterval])

  return {
    isConfirmed,
    isChecking,
    error,
    checkNow: checkConfirmation
  }
}
