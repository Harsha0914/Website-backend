import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowRight, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import api, { getBaseUrl } from '../../services/api';
import AuthLayout from '../../components/layout/AuthLayout';

export default function LoginPage() {
  const { login, sendPasswordOtp, verifyOtpAndResetPassword, loading, error, isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);

  // Forgot password state
  const [resetEmail, setResetEmail] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [resetStep, setResetStep] = useState('request'); // 'request' -> 'verify'
  const [resetNewPass, setResetNewPass] = useState('');
  const [showResetPass, setShowResetPass] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    const qUser = searchParams.get('username') || searchParams.get('email');
    if (qUser) {
      setUsername(qUser);
      setResetEmail(qUser);
    }
    if (searchParams.get('forgot') === '1') {
      openForgotModal();
    }
  }, [searchParams]);

  const openForgotModal = () => {
    setResetEmail(username || '');
    setResetOtp('');
    setResetStep('request');
    setResetNewPass('');
    setResetError('');
    setResetSuccess('');
    setShowForgotModal(true);
  };

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setResetError('');
    setResetSuccess('');

    if (!resetEmail || !resetEmail.includes('@')) {
      setResetError('Please enter a valid email address.');
      return;
    }

    setResetLoading(true);
    try {
      const res = await sendPasswordOtp(resetEmail);
      setResetSuccess(res.message || 'If an account exists for this email, a verification code has been sent.');
      setResetStep('verify');
    } catch (err) {
      setResetError(err.message || 'Failed to send the verification code.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleVerifyAndReset = async (e) => {
    e.preventDefault();
    setResetError('');
    setResetSuccess('');

    if (!/^\d{4,8}$/.test(resetOtp.trim())) {
      setResetError('Enter the 4-8 digit code from your email.');
      return;
    }
    if (
      resetNewPass.length < 8 ||
      !/[A-Z]/.test(resetNewPass) ||
      !/[a-z]/.test(resetNewPass) ||
      !/\d/.test(resetNewPass)
    ) {
      setResetError('New password needs 8+ characters with an uppercase letter, a lowercase letter and a number.');
      return;
    }

    setResetLoading(true);
    try {
      const res = await verifyOtpAndResetPassword({
        email: resetEmail,
        otp: resetOtp,
        new_password: resetNewPass,
        confirm_password: resetNewPass,
      });
      setResetSuccess(res.message || 'Password updated successfully! You can now log in.');
      setUsername(resetEmail);
      setPassword('');
      setTimeout(() => {
        setShowForgotModal(false);
        setResetSuccess('');
      }, 1400);
    } catch (err) {
      setResetError(err.message || 'Failed to reset password.');
    } finally {
      setResetLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      if (user?.role === 'ADMIN') {
        navigate('/admin/dashboard', { replace: true });
      } else {
        const from = location.state?.from?.pathname;
        const target = (from && from !== '/login' && from !== '/') ? from : '/dashboard';
        navigate(target, { replace: true });
      }
    }
  }, [isAuthenticated, user, navigate, location]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');

    const cleanUser = username.trim();
    if (!cleanUser && !password) {
      setValidationError('Please enter your username and password.');
      return;
    }
    if (!cleanUser) {
      setValidationError('Please enter your username.');
      return;
    }
    if (!password) {
      setValidationError('Please enter your password.');
      return;
    }

    try {
      const userInfo = await login(cleanUser, password);
      if (userInfo.role === 'ADMIN') {
        navigate('/admin/dashboard', { replace: true });
      } else {
        const from = location.state?.from?.pathname;
        const target = (from && from !== '/login' && from !== '/') ? from : '/dashboard';
        navigate(target, { replace: true });
      }
    } catch (err) {
      // Error handled by store
    }
  };


  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to find nearby shops and see which ones need a website."
      footer={
        <p className="ui-help">
          New here?{' '}
          <Link to="/register?role=user" className="font-semibold underline" style={{ color: 'var(--ui-primary-text)' }}>
            Create an account
          </Link>
          <span className="mx-2" aria-hidden="true">·</span>
          <Link to="/register?role=admin" className="underline">Register as administrator</Link>
        </p>
      }
    >
      {(validationError || error) && (
        <div className="ui-notice ui-notice-error mb-5" role="alert">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <span>{validationError || (typeof error === 'string' ? error : 'Something went wrong. Please try again.')}</span>
            {!validationError && typeof error === 'string' && error.toLowerCase().includes('not found') && (
              <div className="mt-2">
                <Link to={`/register?username=${encodeURIComponent(username)}`} className="font-semibold underline">
                  Create an account instead
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div>
          <label htmlFor="login-username" className="ui-label">Username or email</label>
          <input
            id="login-username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => { setUsername(e.target.value); setValidationError(''); }}
            placeholder="you@example.com"
            className="ui-input"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="login-password" className="ui-label !mb-0">Password</label>
            <button type="button" onClick={openForgotModal} className="text-sm font-semibold" style={{ color: 'var(--ui-primary-text)' }}>
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setValidationError(''); }}
              placeholder="Your password"
              className="ui-input"
              style={{ paddingRight: 76 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 ui-btn ui-btn-ghost ui-btn-sm"
              aria-pressed={showPassword}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <button type="submit" disabled={loading} className="ui-btn ui-btn-primary ui-btn-lg ui-btn-block">
          {loading ? 'Signing in…' : 'Sign in'}
          {!loading && <ArrowRight className="h-5 w-5" aria-hidden="true" />}
        </button>
      </form>

      {/* Reset password dialog: e-mail, then code, then new password */}
      {showForgotModal && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(15, 23, 42, 0.5)' }}
          onClick={(e) => e.target === e.currentTarget && setShowForgotModal(false)}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="reset-title" className="ui-card w-full sm:max-w-md p-6 rounded-b-none sm:rounded-b-[14px]" style={{ boxShadow: 'var(--ui-shadow-lg)' }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="reset-title" className="ui-h2">Reset your password</h2>
                <p className="ui-help mt-1">
                  {resetStep === 'request'
                    ? 'Enter your e-mail and we will send you a one-time code.'
                    : 'Enter the code from your e-mail and choose a new password.'}
                </p>
              </div>
              <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" style={{ width: 40, padding: 0 }} onClick={() => setShowForgotModal(false)} aria-label="Close">✕</button>
            </div>

            {resetSuccess && (
              <div className="ui-notice ui-notice-success mt-4" role="status">
                <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>{resetSuccess}</span>
              </div>
            )}
            {resetError && (
              <div className="ui-notice ui-notice-error mt-4" role="alert">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>{resetError}</span>
              </div>
            )}

            <form onSubmit={resetStep === 'request' ? handleRequestOtp : handleVerifyAndReset} className="mt-5 space-y-4">
              <div>
                <label htmlFor="reset-email" className="ui-label">E-mail address</label>
                <input
                  id="reset-email"
                  type="email"
                  required
                  disabled={resetStep === 'verify'}
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="ui-input"
                />
              </div>

              {resetStep === 'verify' && (
                <>
                  <div>
                    <label htmlFor="reset-otp" className="ui-label">Code from your e-mail</label>
                    <input
                      id="reset-otp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      value={resetOtp}
                      onChange={(e) => setResetOtp(e.target.value)}
                      placeholder="6-digit code"
                      className="ui-input tracking-widest"
                    />
                  </div>
                  <div>
                    <label htmlFor="reset-new" className="ui-label">New password</label>
                    <div className="relative">
                      <input
                        id="reset-new"
                        type={showResetPass ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        value={resetNewPass}
                        onChange={(e) => setResetNewPass(e.target.value)}
                        className="ui-input"
                        style={{ paddingRight: 76 }}
                      />
                      <button type="button" onClick={() => setShowResetPass(!showResetPass)} className="absolute right-2 top-1/2 -translate-y-1/2 ui-btn ui-btn-ghost ui-btn-sm" aria-pressed={showResetPass}>
                        {showResetPass ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <p className="ui-help mt-1.5">At least 8 characters, with an upper-case letter, a lower-case letter and a number.</p>
                  </div>
                </>
              )}

              <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end pt-2">
                <button type="button" className="ui-btn ui-btn-secondary" onClick={() => setShowForgotModal(false)}>Cancel</button>
                <button type="submit" disabled={resetLoading} className="ui-btn ui-btn-primary">
                  {resetLoading ? 'Please wait…' : resetStep === 'request' ? 'Send code' : 'Set new password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
