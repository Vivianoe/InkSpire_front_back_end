'use client';

import { useState } from 'react';
import { Dialog } from '@headlessui/react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import styles from './Navigation.module.css';
import { useAuth } from '@/app/contexts/AuthContext';
import { UserProfileDropdown } from '@/app/auth/UserProfileDropdown';
import { SignInButton } from '@/app/auth/SignInButton';
import { AuthModal } from '@/app/auth/AuthModal';

const NAVIGATION_LINKS = [
  { name: 'Dashboard', href: '/' },
  { name: 'History', href: '/history' },
];

export default function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user } = useAuth();
	const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <header className={styles.header}>
      <nav className={styles.nav} aria-label="Global">
        <div className={styles.logoContainer}>
          <Link href="/" className={styles.logo}>
            <h1 className={styles.logoText}>Inkspire</h1>
          </Link>
        </div>
        <div className={styles.mobileMenuButton}>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
          >
            <span className="sr-only">Open main menu</span>
            <Bars3Icon className={styles.menuIcon} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.desktopNav}>
          {NAVIGATION_LINKS.map((item) => (
            <Link key={item.name} href={item.href} className={styles.navLink}>
              {item.name}
            </Link>
          ))}
        </div>
        <div className={styles.profileContainer}>
          {user ? (
            <UserProfileDropdown
              dropdownPosition="top-right"
              showUserName={true}
              className="transition-all duration-200 hover:bg-gray-50/80 rounded-lg pl-1"
            />
          ) : (
            <SignInButton
              className="bg-blue-600 text-white font-semibold text-sm px-3 py-1.5 rounded-md hover:bg-blue-700 transition-colors cursor-pointer"
              showLoading={true}
              showModal={false}
              onClick={() => setShowAuthModal(true)}
						/>
          )}
        </div>

        {/* Auth modal */}
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
        />
      </nav>

      <Dialog as="div" className="lg:hidden" open={mobileMenuOpen} onClose={setMobileMenuOpen}>
        <div className="fixed inset-0 z-10" />
        <Dialog.Panel className={styles.mobileMenu}>
          <div className={styles.mobileMenuHeader}>
            <Link href="/" className={styles.logo}>
              <span className="sr-only">Inkspire</span>
              <h1 className={styles.logoText}>Inkspire</h1>
            </Link>
            <button
              type="button"
              className={styles.mobileMenuCloseButton}
              onClick={() => setMobileMenuOpen(false)}
            >
              <span className="sr-only">Close menu</span>
              <XMarkIcon className={styles.closeIcon} aria-hidden="true" />
            </button>
          </div>
          <div className={styles.mobileMenuContent}>
            <div className={styles.mobileMenuItems}>
              {NAVIGATION_LINKS.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={styles.mobileNavLink}
                >
                  {item.name}
                </Link>
              ))}
            </div>
          </div>
        </Dialog.Panel>
      </Dialog>
    </header>
  );
}

