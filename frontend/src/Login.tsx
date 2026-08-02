import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePageTitle } from './hooks/usePageTitle';
import { getApiUrl } from './api';
import { GoogleSignInButton } from './components/auth/GoogleSignInButton';
import { safeReturnTo } from './utils/safeReturnTo';
import AuthCard, { PasswordToggle } from './layouts/AuthCard';
import { Button, Field, Notice } from './components/ui';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Set dynamic page title
  usePageTitle('Login');

  const [searchParams] = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get('returnTo'));

  // Check if Google OAuth is configured
  const googleOAuthEnabled = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

  const handleGoogleSuccess = (response: {
    access_token: string;
    refresh_token: string;
    account_linked: boolean;
  }) => {
    localStorage.setItem('token', response.access_token);
    localStorage.setItem('refreshToken', response.refresh_token);
    // Full reload so AuthProvider's mount-time effect rehydrates the user from the freshly-stored token.
    window.location.href = returnTo;
  };

  const handleGoogleError = (errorMessage: string) => {
    setError(errorMessage);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('username', email);
      formData.append('password', password);

      const response = await fetch(getApiUrl('token'), {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Login failed');
      }

      const data = await response.json();
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('refreshToken', data.refresh_token);
      window.location.href = returnTo;
    } catch {
      setError('Invalid credentials');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthCard title="Sign in" centered>
      {/* Google Sign-In Button */}
      {googleOAuthEnabled && (
        <>
          <div className="mt-6">
            <GoogleSignInButton
              onSuccess={handleGoogleSuccess}
              onError={handleGoogleError}
            />
          </div>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-sw-line"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="px-2 bg-sw-surface text-[11px] uppercase tracking-[0.09em] text-sw-dim">
                Or continue with email
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

      <form className="mt-6 flex flex-col gap-3.5" onSubmit={handleLogin}>
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
          autoComplete="current-password"
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

        <div className="flex items-center justify-end">
          <Link
            to="/forgot-password"
            className="text-[12.5px] font-medium text-sw-accent hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <Button
          type="submit"
          variant="primary"
          block
          disabled={isLoading}
          className="py-2.5 min-h-[42px]"
          icon={
            isLoading ? (
              <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-sw-line border-t-sw-accent" />
            ) : undefined
          }
        >
          {isLoading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="mt-6 text-center text-[12.5px] text-sw-muted">
        Don't have an account?{' '}
        <Link to="/register" className="font-medium text-sw-accent hover:underline">
          Register
        </Link>
      </p>
    </AuthCard>
  );
};

export default Login;
