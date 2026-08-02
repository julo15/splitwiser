import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle } from '@phosphor-icons/react';
import { usePageTitle } from './hooks/usePageTitle';
import { api } from './services/api';
import { getErrorMessage } from './utils/errors';
import AuthCard from './layouts/AuthCard';
import { Button } from './components/ui';

const VerifyEmailPage = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  usePageTitle('Verify Email');

  useEffect(() => {
    const verifyEmail = async () => {
      if (!token) {
        setError('Invalid verification link');
        setIsLoading(false);
        return;
      }

      try {
        await api.profile.verifyEmail(token);
        setIsSuccess(true);

        // Redirect to account settings after 3 seconds
        setTimeout(() => {
          navigate('/account');
        }, 3000);
      } catch (err) {
        setError(getErrorMessage(err) || 'Failed to verify email. The link may have expired.');
      } finally {
        setIsLoading(false);
      }
    };

    verifyEmail();
  }, [token, navigate]);

  if (isLoading) {
    return (
      <AuthCard
        title="Verifying your email…"
        centered
        mark={{
          tone: 'accent',
          icon: (
            <span className="animate-spin rounded-full h-6 w-6 border-2 border-sw-line border-t-sw-accent" />
          ),
        }}
        subtitle="Please wait while we verify your email address."
      />
    );
  }

  if (isSuccess) {
    return (
      <AuthCard
        title="Email verified successfully"
        centered
        mark={{
          tone: 'success',
          icon: <CheckCircle size={24} weight="fill" aria-hidden="true" />,
        }}
        subtitle="Your email address has been updated. Redirecting to account settings…"
      />
    );
  }

  return (
    <AuthCard
      title="Verification failed"
      centered
      mark={{
        tone: 'error',
        icon: <XCircle size={24} weight="fill" aria-hidden="true" />,
      }}
      subtitle={error}
    >
      <div className="mt-8">
        <Button
          variant="primary"
          block
          onClick={() => navigate('/account')}
          className="py-2.5 min-h-[42px]"
        >
          Go to account settings
        </Button>
      </div>
    </AuthCard>
  );
};

export default VerifyEmailPage;
