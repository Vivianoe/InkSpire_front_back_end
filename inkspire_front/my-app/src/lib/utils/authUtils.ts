/**
 * Authentication utility functions
 * Consolidates all session and token operations from multiple locations
 */

import { supabase } from '@/lib/supabase/client'
import type { User, Session, AuthError } from '@supabase/supabase-js'

/**
 * Result of session check operations
 * Provides consistent return type across all auth utilities
 */
export interface SessionCheckResult {
  user: User | null
  session: Session | null
  isConfirmed: boolean
  error: AuthError | null
}

/**
 * Check and refresh current session
 * @returns Session check result with confirmation status
 */
export async function checkAndRefreshSession(): Promise<SessionCheckResult> {
  try {
    const { data, error } = await supabase.auth.refreshSession()

    if (error) {
      return { user: null, session: null, isConfirmed: false, error }
    }

    const user = data.session?.user ?? null
    const isConfirmed = user?.email_confirmed_at !== null

    return { user, session: data.session, isConfirmed, error: null }
  } catch (err) {
    return {
      user: null,
      session: null,
      isConfirmed: false,
      error: err as AuthError
    }
  }
}

/**
 * Get current user without triggering a refresh
 *
 * Useful when you want to check status without making API calls
 *
 * @returns Session check result with current state
 */
export async function getCurrentUser(): Promise<SessionCheckResult> {
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    const { data: { session } } = await supabase.auth.getSession()

    if (error) {
      return { user: null, session: null, isConfirmed: false, error }
    }

    const isConfirmed = user?.email_confirmed_at !== null
    return { user, session, isConfirmed, error: null }
  } catch (err) {
    return {
      user: null,
      session: null,
      isConfirmed: false,
      error: err as AuthError
    }
  }
}

/**
 * Tokens extracted from URL (query params or hash params)
 */
export interface TokensFromURL {
  accessToken: string | null
  refreshToken: string | null
  error: string | null
  errorDescription: string | null
}

/**
 * Extract authentication tokens from URL
 *
 * Consolidates token extraction logic from confirm/page.tsx (lines 27-59)
 * Handles both query parameters and hash parameters
 *
 * @param searchParams - URL search parameters from Next.js useSearchParams
 * @returns Extracted tokens or error information
 *
 * @example
 * // Query params: ?access_token=xxx&refresh_token=yyy
 * // Hash params: #access_token=xxx&refresh_token=yyy
 * const tokens = extractTokensFromURL(searchParams)
 * if (tokens.error) {
 *   // Handle error
 * } else if (tokens.accessToken && tokens.refreshToken) {
 *   // Use tokens
 * }
 */
export function extractTokensFromURL(searchParams: URLSearchParams): TokensFromURL {
  // Check for error parameters first
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  if (error) {
    return { accessToken: null, refreshToken: null, error, errorDescription }
  }

  // Try query params first (standard approach)
  let accessToken = searchParams.get('access_token')
  let refreshToken = searchParams.get('refresh_token')

  // Fallback to hash params if not in query (Supabase sometimes uses hash)
  if (!accessToken && typeof window !== 'undefined' && window.location.hash) {
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    accessToken = hashParams.get('access_token')
    refreshToken = hashParams.get('refresh_token')
  }

  return { accessToken, refreshToken, error: null, errorDescription: null }
}

/**
 * Set session from tokens
 *
 * Used after token extraction to establish authenticated session
 * Consolidates session setup logic from confirm page
 *
 * @param accessToken - JWT access token
 * @param refreshToken - Refresh token
 * @returns Error if session setup fails
 */
export async function setSessionFromTokens(
  accessToken: string,
  refreshToken: string
): Promise<{ error: AuthError | null }> {
  try {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    })
    return { error }
  } catch (err) {
    return { error: err as AuthError }
  }
}

/**
 * Wait for session to be established
 *
 * Helper function for scenarios where session needs time to propagate
 * Used after setSession to ensure session is fully initialized
 *
 * @param delayMs - Milliseconds to wait (default 500ms)
 */
export async function waitForSession(delayMs: number = 500): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, delayMs))
}
