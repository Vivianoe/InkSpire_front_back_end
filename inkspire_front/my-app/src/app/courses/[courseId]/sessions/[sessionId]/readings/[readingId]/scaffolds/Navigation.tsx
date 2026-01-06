'use client';

import { useState } from 'react';
import { Dialog } from '@headlessui/react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import styles from './Navigation.module.css';

const NAVIGATION_LINKS = [
  { name: 'Dashboard', href: '/' },
  { name: 'History', href: '/history' },
];

export default function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
            <Link
              key={item.name}
              href={item.href}
              className={styles.navLink}
            >
              {item.name}
            </Link>
          ))}
        </div>
      </nav>

      <Dialog as="div" className={styles.mobileMenu} open={mobileMenuOpen} onClose={setMobileMenuOpen}>
        <Dialog.Panel className={styles.mobileMenuPanel}>
          <div className={styles.mobileMenuHeader}>
            <Link href="/" className={styles.logo}>
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
