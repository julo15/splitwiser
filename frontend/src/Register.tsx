import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { usePageTitle } from './hooks/usePageTitle';
import { getApiUrl } from './api';
import { GoogleSignInButton } from './components/auth/GoogleSignInButton';
import AuthCard, { PasswordToggle } from './layouts/AuthCard';
import { Button, Field, Notice } from './components/ui';

const Register = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const location = useLocation();

  // Set dynamic page title
  usePageTitle('Register');

  // Check if Google OAuth is configured
  const googleOAuthEnabled = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

  // Get guest claiming params from URL
  const searchParams = new URLSearchParams(location.search);
  const claimGuestId = searchParams.get('claim_guest_id');
  const shareLinkId = searchParams.get('share_link_id');

  const handleGoogleSuccess = (response: {
    access_token: string;
    refresh_token: string;
    claimed_group_id?: number;
  }) => {
    localStorage.setItem('token', response.access_token);
    localStorage.setItem('refreshToken', response.refresh_token);

    if (response.claimed_group_id) {
      window.location.href = `/groups/${response.claimed_group_id}`;
    } else {
      window.location.href = '/';
    }
  };

  const handleGoogleError = (errorMessage: string) => {
    setError(errorMessage);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch(getApiUrl('register'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          full_name: fullName,
          claim_guest_id: claimGuestId ? parseInt(claimGuestId) : undefined,
          share_link_id: shareLinkId
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Registration failed');
      }
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('refreshToken', data.refresh_token);

      if (data.claimed_group_id) {
        window.location.href = `/groups/${data.claimed_group_id}`;
      } else {
        window.location.href = '/';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthCard title="Register" centered>
      {/* Google Sign-In Button */}
      {googleOAuthEnabled && (
        <>
          <div className="mt-6">
            <GoogleSignInButton
              onSuccess={handleGoogleSuccess}
              onError={handleGoogleError}
              claimGuestId={claimGuestId ? parseInt(claimGuestId) : undefined}
              shareLinkId={shareLinkId || undefined}
            />
          </div>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-sw-line"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="px-2 bg-sw-surface text-[11px] uppercase tracking-[0.09em] text-sw-dim">
                Or register with email
              </span>
            </div>
          </div>
        </>
      )}

      {error && (
        <Notice tone="error" className="mt-6">
          {error}
        </Notice>
      )}

      <form className="mt-6 flex flex-col gap-3.5" onSubmit={handleRegister}>
        <Field
          label="Full name"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          aria-invalid={!!error}
        />
        <Field
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!error}
        />
        <Field
          label="Password"
          name="password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!error}
          trailing={
            <PasswordToggle
              shown={showPassword}
              onToggle={() => setShowPassword(!showPassword)}
            />
          }
        />

        <Button
          type="submit"
          variant="primary"
          block
          disabled={isLoading}
          className="mt-1 py-2.5 min-h-[42px]"
          icon={
            isLoading ? (
              <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-sw-line border-t-sw-accent" />
            ) : undefined
          }
        >
          {isLoading ? 'Registering…' : 'Register'}
        </Button>
      </form>

      <p className="mt-6 text-center text-[12.5px] text-sw-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-sw-accent hover:underline">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
};

export default Register;
