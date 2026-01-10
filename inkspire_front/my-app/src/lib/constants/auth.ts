/**
 * Authentication constants for email confirmation feature
 * Single source of truth for configuration values
 */

/**
 * Path for email confirmation redirect
 * Used by backend when generating confirmation emails
 */
export const EMAIL_CONFIRMATION_REDIRECT = '/auth/confirm'

/**
 * BroadcastChannel name for cross-tab email confirmation sync
 * Modern approach for detecting confirmation in other tabs
 */
export const EMAIL_CONFIRMATION_CHANNEL = 'inkspire-email-confirmation'

/**
 * Legacy localStorage keys for backward compatibility
 * Used as fallback when BroadcastChannel is not supported
 */
export const LEGACY_CONFIRMATION_SIGNAL_KEY = 'inkspire-email-confirmation-signal'
export const LEGACY_CONFIRMATION_ACK_KEY = 'inkspire-email-confirmation-ack'

/**
 * Polling interval for checking email confirmation status (in milliseconds)
 * Reduced frequency compared to old implementation (was 2s, now 5s)
 * BroadcastChannel provides instant cross-tab sync, so polling is only for single-tab scenario
 */
export const CONFIRMATION_POLL_INTERVAL = 5000 // 5 seconds

/**
 * Cooldown period between resend email attempts (in seconds)
 * Prevents spam and rate limiting issues
 */
export const RESEND_COOLDOWN_SECONDS = 60

/**
 * Delay before cleaning up confirmation page (in milliseconds)
 * Ensures localStorage writes complete before tab closes
 */
export const CONFIRMATION_PAGE_CLEANUP_DELAY = 500
