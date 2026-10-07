import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Store, User, Mail, Lock, ArrowRight, ArrowLeft, AlertCircle, HelpCircle, Eye, EyeOff, CheckCircle, KeyRound } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import api, { getBaseUrl } from '../../services/api';
import MobileBottomNav from '../../components/layout/MobileBottomNav';

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50/60 via-slate-50 to-indigo-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      
      {/* Brand Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-3">
        <Link to="/" className="inline-flex items-center gap-2.5 group">
          <div className="p-2.5 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-xl shadow-md shadow-blue-500/25 group-hover:scale-105 transition-transform">
            <Store className="w-6 h-6" />
          </div>
          <span className="text-slate-900 dark:text-white font-black text-2xl tracking-tight">
            Website <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Presence</span> Detection
          </span>
        </Link>

        <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight pt-2">
          Sign in to your account
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-sm mx-auto font-medium">
          Access your dashboard to discover shops and check online website presence
        </p>
      </div>

      {/* Main Form Card */}
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl py-8 px-6 sm:px-10 shadow-xl shadow-blue-500/5 dark:shadow-none rounded-3xl border border-slate-200/80 dark:border-slate-800 space-y-5">
          
          {(validationError || error) && (
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 space-y-2.5">
              <div className="flex items-center gap-2.5 text-xs font-semibold text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{validationError || (typeof error === 'string' ? error : JSON.stringify(error))}</span>
              </div>
              {!validationError && typeof error === 'string' && error.toLowerCase().includes('not found') && (
                <div className="pt-2 border-t border-rose-200/60 dark:border-rose-900/60">
                  <Link
                    to={`/register?username=${encodeURIComponent(username)}`}
                    className="block w-full py-2.5 px-3 text-center text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors"
                  >
                    Register / Create Account Now →
                  </Link>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username or Email Address */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Username or Email</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setValidationError('');
                  }}
                  placeholder="Enter your username or email"
                  className="w-full pl-10 pr-3.5 py-3 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Password</label>
                <button
                  type="button"
                  onClick={openForgotModal}
                  className="text-[11px] font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 transition-colors"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setValidationError('');
                  }}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-3 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 text-xs font-black text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-xl shadow-md shadow-blue-500/25 transition-all flex items-center justify-center gap-2 active:scale-98 disabled:opacity-75"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Registration Links */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 text-center space-y-3">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Don't have an account yet?</p>
            <div className="flex items-center justify-center gap-2.5">
              <Link
                to="/register?role=user"
                className="flex-1 py-2 px-3 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-xl border border-blue-200 dark:border-blue-900/60 transition-colors text-center"
              >
                User Register
              </Link>
              <Link
                to="/register?role=admin"
                className="flex-1 py-2 px-3 text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 rounded-xl border border-amber-200 dark:border-amber-900/60 transition-colors text-center"
              >
                Admin Register
              </Link>
            </div>
          </div>
        </div>

        {/* Back to Overview Button */}
        <div className="mt-6 text-center">
          <Link
            to="/landing"
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-full transition-all shadow-xs"
          >
            <ArrowLeft className="w-4 h-4 text-blue-600" />
            <span>Explore Overview &amp; Features</span>
          </Link>
        </div>
      </div>

      {/* Forgot / Reset Password Modal matching Image 2 */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-pink-50 dark:bg-pink-950/60 text-[#d92672] dark:text-pink-400 rounded-xl border border-pink-200/60 dark:border-pink-900/60">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-slate-900 dark:text-white font-black text-lg tracking-tight">Reset Password</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">We will e-mail you a one-time code</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowForgotModal(false);
                  setResetError('');
                  setResetSuccess('');
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Success Alert */}
            {resetSuccess && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 flex items-center gap-2.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{resetSuccess}</span>
              </div>
            )}

            {/* Error Alert */}
            {resetError && (
              <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-center gap-2.5 text-xs font-semibold text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{resetError}</span>
              </div>
            )}

            {/* Reset Password: e-mail a one-time code, then set a new password */}
            <form onSubmit={resetStep === 'request' ? handleRequestOtp : handleVerifyAndReset} className="space-y-4">
              {/* Email Address */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="email"
                    required
                    disabled={resetStep === 'verify'}
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full pl-10 pr-3.5 py-3 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-pink-500/20 focus:border-[#d92672] transition-all disabled:opacity-60"
                  />
                </div>
              </div>

              {resetStep === 'verify' && (
                <>
                  {/* One-time code */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Verification code
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      value={resetOtp}
                      onChange={(e) => setResetOtp(e.target.value)}
                      placeholder="6-digit code from your email"
                      className="w-full px-3.5 py-3 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-pink-500/20 focus:border-[#d92672] transition-all tracking-widest"
                    />
                  </div>

                  {/* New password */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      New password
                    </label>
                    <div className="relative">
                      <input
                        type={showResetPass ? 'text' : 'password'}
                        required
                        value={resetNewPass}
                        onChange={(e) => setResetNewPass(e.target.value)}
                        placeholder="8+ chars, upper, lower and a number"
                        className="w-full px-3.5 pr-10 py-3 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-pink-500/20 focus:border-[#d92672] transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowResetPass(!showResetPass)}
                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        {showResetPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Action Buttons */}
              <div className="pt-2 space-y-2.5">
                <button
                  type="submit"
                  disabled={resetLoading}
                  className="w-full py-3.5 px-4 text-xs font-black text-white bg-[#d92672] hover:bg-[#c2185b] rounded-xl shadow-md shadow-pink-500/25 transition-all flex items-center justify-center gap-2 active:scale-98 disabled:opacity-75 cursor-pointer"
                >
                  {resetLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                      <span>Please wait...</span>
                    </>
                  ) : (
                    <span>{resetStep === 'request' ? 'Send verification code' : 'Reset password'}</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="w-full py-2.5 px-4 text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>

          </div>
        </div>
      )}
      <MobileBottomNav />
    </div>
  );
}


