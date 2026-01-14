'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

export default function SignInPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmSuccess, setConfirmSuccess] = useState(false);
  const router = useRouter();

  // Check for email confirmation redirect success message
  useEffect(() => {
    const confirmedRedirect = localStorage.getItem('inkspire-email-confirmed-redirect')
    if (confirmedRedirect) {
      setConfirmSuccess(true)
      setError(null)
      localStorage.removeItem('inkspire-email-confirmed-redirect')
      // Clear success message after 5 seconds
      setTimeout(() => setConfirmSuccess(false), 5000)
    }
  }, [])

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null); // Clear error on input change
  };

  const validateForm = () => {
    if (!formData.email || !formData.password) {
      setError('Email and password are required');
      return false;
    }

    if (!formData.email.includes('@')) {
      setError('Please enter a valid email address');
      return false;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }

    if (isSignUp) {
      if (!formData.firstName || !formData.lastName) {
        setError('First name and last name are required');
        return false;
      }

      if (formData.password !== formData.confirmPassword) {
        setError('Passwords do not match');
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const endpoint = isSignUp ? '/api/users/register' : '/api/users/login';
      const requestBody = {
        email: formData.email,
        password: formData.password,
        ...(isSignUp && {
          name: `${formData.firstName} ${formData.lastName}`,
        }),
      };
      
      console.log('Sending auth request to:', endpoint);
      console.log('Request body:', { ...requestBody, password: '***' }); // Don't log password
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const rawText = await response.text();
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = { message: rawText };
      }

      if (!response.ok) {
        setError(data?.detail || data?.message || rawText || 'An error occurred');
        setLoading(false);
        return;
      }

      // Store token if provided
      if (data.access_token) {
        localStorage.setItem('auth_token', data.access_token);
      }

      // Store user info
      if (data.user) {
        localStorage.setItem('user', JSON.stringify(data.user));
      }

      // Redirect to dashboard
      router.push('/');
    } catch (err) {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.authCard}>
        <div className={styles.authHeader}>
          <h1 className={styles.title}>
            {isSignUp ? 'Create Account' : 'Welcome Back'}
          </h1>
          <p className={styles.subtitle}>
            {isSignUp
              ? 'Sign up to get started with Inkspire'
              : 'Sign in to your account'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {isSignUp && (
            <>
              <div className={styles.nameRow}>
                <div className={styles.inputGroup}>
                  <label htmlFor="firstName" className={styles.label}>
                    First Name
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => handleInputChange('firstName', e.target.value)}
                    className={styles.input}
                    placeholder="John"
                    required
                  />
                </div>
                <div className={styles.inputGroup}>
                  <label htmlFor="lastName" className={styles.label}>
                    Last Name
                  </label>
                  <input
                    id="lastName"
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => handleInputChange('lastName', e.target.value)}
                    className={styles.input}
                    placeholder="Doe"
                    required
                  />
                </div>
              </div>
            </>
          )}

          <div className={styles.inputGroup}>
            <label htmlFor="email" className={styles.label}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              className={styles.input}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="password" className={styles.label}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => handleInputChange('password', e.target.value)}
              className={styles.input}
              placeholder="••••••••"
              required
            />
          </div>

          {isSignUp && (
            <div className={styles.inputGroup}>
              <label htmlFor="confirmPassword" className={styles.label}>
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                className={styles.input}
                placeholder="••••••••"
                required
              />
            </div>
          )}

          {confirmSuccess && (
            <div className={styles.successMessage}>
              ✓ Email confirmed! Please sign in to continue.
            </div>
          )}

          {error && (
            <div className={styles.errorMessage}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className={styles.submitButton}
            disabled={loading}
          >
            {loading ? 'Please wait...' : isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
        </form>

        <div className={styles.switchMode}>
          <p className={styles.switchText}>
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}
          </p>
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
              setFormData({
                email: '',
                password: '',
                confirmPassword: '',
                firstName: '',
                lastName: '',
              });
            }}
            className={styles.switchButton}
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </div>
      </div>
    </div>
  );
}
