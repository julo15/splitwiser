import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { CheckCircle } from '@phosphor-icons/react';
import { usePageTitle } from './hooks/usePageTitle';
import { api } from './services/api';
import { getErrorMessage } from './utils/errors';
import AuthCard, { PasswordToggle } from './layouts/AuthCard';
import { Button, Field, Notice } from './components/ui';

const ResetPasswordPage = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  usePageTitle('Reset Password');

  useEffect(() => {
    if (!token) {
      setError('Invalid reset link');
    }
  }, [token]);

  useEffect(() => {
    if (isSuccess) {
      // Redirect to login after 3 seconds
      const timer = setTimeout(() => {
        navigate('/login');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isSuccess, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!token) {
      setError('Invalid reset link');
      return;
    }

    setIsLoading(true);

    try {
      await api.profile.resetPassword(token, newPassword);
      setIsSuccess(true);
    } catch (err) {
      setError(getErrorMessage(err) || 'Failed to reset password. The link may have expired.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <AuthCard
        title="Password reset successfully"
        centered
        mark={{
          tone: 'success',
          icon: <CheckCircle size={24} weight="fill" aria-hidden="true" />,
        }}
        subtitle="You can now log in with your new password. Redirecting to the login page…"
      />
    );
  }

  return (
    <AuthCard
      title="Set new password"
      centered
      subtitle="Enter your new password below."
    >
      {error && (
        <Notice tone="error" className="mt-6">
          {error}
        </Notice>
      )}

      <form className="mt-6 flex flex-col gap-3.5" onSubmit={handleSubmit}>
        <Field
          label="New password"
          name="newPassword"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="At least 8 characters"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          disabled={isLoading}
          trailing={
            <PasswordToggle
              shown={showPassword}
              onToggle={() => setShowPassword(!showPassword)}
              label="passwords"
            />
          }
        />
        <Field
          label="Confirm new password"
          name="confirmPassword"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={isLoading}
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
          {isLoading ? 'Resetting…' : 'Reset password'}
        </Button>

        <div className="text-center">
          <Link
            to="/login"
            className="text-[12.5px] font-medium text-sw-accent hover:underline"
          >
            Back to login
          </Link>
        </div>
      </form>
    </AuthCard>
  );
};

export default ResetPasswordPage;
