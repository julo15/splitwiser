import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle } from '@phosphor-icons/react';
import { usePageTitle } from './hooks/usePageTitle';
import { api } from './services/api';
import AuthCard from './layouts/AuthCard';
import { Button, Field, Notice } from './components/ui';

const ForgotPasswordPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  usePageTitle('Forgot Password');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await api.profile.forgotPassword(email);
      setIsSuccess(true);
    } catch {
      setError('Failed to send reset email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <AuthCard
        title="Check your email"
        centered
        mark={{
          tone: 'success',
          icon: <CheckCircle size={24} weight="fill" aria-hidden="true" />,
        }}
        subtitle={
          <>
            If an account with that email exists, you will receive a password
            reset link shortly. The link will expire in 1 hour.
          </>
        }
      >
        <div className="mt-8">
          <Button
            variant="primary"
            block
            onClick={() => navigate('/login')}
            className="py-2.5 min-h-[42px]"
          >
            Back to login
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      centered
      subtitle="Enter your email address and we'll send you a link to reset your password."
    >
      {error && (
        <Notice tone="error" className="mt-6">
          {error}
        </Notice>
      )}

      <form className="mt-6 flex flex-col gap-3.5" onSubmit={handleSubmit}>
        <Field
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
          {isLoading ? 'Sending…' : 'Send reset link'}
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

export default ForgotPasswordPage;
