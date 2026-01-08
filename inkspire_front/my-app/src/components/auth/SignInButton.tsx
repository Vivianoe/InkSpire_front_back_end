'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { AuthModal } from './AuthModal'

interface SignInButtonProps {
	/**
	 * Custom CSS classes for styling the button
	 */
	className?: string
	/**
	 * Whether to show loading state when auth is loading
	 */
	showLoading?: boolean
	/**
	 * Custom button text (overrides translation)
	 */
	customText?: string
	/**
	 * Whether to show AuthModal inline (for components that handle their own modal)
	 */
	showModal?: boolean
	/**
	 * Custom onClick handler (for external modal management)
	 */
	onClick?: () => void
}

export function SignInButton({ 
	className,
	showLoading = true,
	customText,
	showModal = true,
	onClick: externalOnClick
}: SignInButtonProps) {
	const { user, loading } = useAuth()
	const [showAuthModal, setShowAuthModal] = useState(false)

	// Don't render if user is authenticated
	if (user) {
		return null
	}

	const defaultClassName = "bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-blue-700 transition-colors cursor-pointer"
	const buttonClassName = className || defaultClassName

	const handleClick = () => {
		if (externalOnClick) {
			externalOnClick()
		} else {
			setShowAuthModal(true)
		}
	}

	const handleModalClose = () => {
		setShowAuthModal(false)
	}

	const buttonText = customText || 'Sign In'
	const displayText = (showLoading && loading) ? 'Loading' : buttonText

	return (
		<>
			<button
				style={{pointerEvents: 'all'}}
				onClick={handleClick}
				disabled={loading}
				className={`${buttonClassName} ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
			>
				{displayText}
			</button>

			{/* Only render modal if showModal is true */}
			{showModal && (
				<AuthModal
					isOpen={showAuthModal}
					onClose={handleModalClose}
				/>
			)}
		</>
	)
}