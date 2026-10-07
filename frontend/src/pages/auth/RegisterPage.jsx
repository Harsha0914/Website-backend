import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Store,
  User,
  Mail,
  Lock,
  Phone,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

export default function RegisterPage() {
  const { register, loading, error } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const initialRole = searchParams.get('role') === 'admin' ? 'ADMIN' : 'USER';
  const [role, setRole] = useState(initialRole);
  const [adminCode, setAdminCode] = useState('');

  const [formData, setFormData] = useState({
    username: '',
    full_name: '',
    email: '',
    phone: '',
    password: '',
    confirm_password: '',
  });

  const [validationError, setValidationError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);


  useEffect(() => {
    if (searchParams.get('role') === 'admin') {
      setRole('ADMIN');
    }
    const qUsername = searchParams.get('username');
    if (qUsername) {
      setFormData((prev) => ({ ...prev, username: qUsername }));
    }
    const qEmail = searchParams.get('email');
    if (qEmail) {
      setFormData((prev) => ({ ...prev, email: qEmail }));
    }
  }, [searchParams]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setValidationError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');

    const cleanUsername = formData.username.trim();
    if (!cleanUsername) {
      setValidationError('Please enter a username.');
      return;
    }
    if (cleanUsername.length < 3) {
      setValidationError('Username must be at least 3 characters long.');
      return;
    }
    if (!formData.password) {
      setValidationError('Please enter a password.');
      return;
    }
    if (formData.password.length < 8) {
      setValidationError('Password must be at least 8 characters long.');
      return;
    }
    if (!/[A-Z]/.test(formData.password)) {
      setValidationError('Password must contain at least one uppercase letter.');
      return;
    }
    if (!/[0-9]/.test(formData.password)) {
      setValidationError('Password must contain at least one number.');
      return;
    }
    if (formData.password !== formData.confirm_password) {
      setValidationError('Passwords do not match.');
      return;
    }

    if (role === 'ADMIN' && !adminCode.trim()) {
      setValidationError('Please enter the admin secret code.');
      return;
    }

    if (!agreeTerms) {
      setValidationError('Please agree with the terms and conditions to create an account.');
      return;
    }

    try {
      await register({
        username: cleanUsername,
        full_name: formData.full_name?.trim() || cleanUsername,
        email: formData.email?.trim() || `${cleanUsername}@shoppresence.local`,
        phone: formData.phone,
        password: formData.password,
        confirm_password: formData.confirm_password,
        role: role,
        admin_code: role === 'ADMIN' ? adminCode.trim() : undefined,
      });

      setSuccessMessage(
        role === 'ADMIN'
          ? 'Admin account created successfully! Redirecting to Sign In...'
          : 'Registration successful! Redirecting to Sign In...'
      );

      // Do NOT automatically log the user into the Dashboard immediately after registration.
      // Redirect to Sign In/Login page.
      setTimeout(() => {
        navigate(`/login?username=${encodeURIComponent(cleanUsername)}`);
      }, 1500);
    } catch (err) {
      // Handled by store error state
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
          Create your account
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-sm mx-auto font-medium">
          Discover local grocery stores, evaluate websites, and improve digital presence
        </p>
      </div>

      {/* Main Form Card */}
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl py-8 px-6 sm:px-10 shadow-xl shadow-blue-500/5 dark:shadow-none rounded-3xl border border-slate-200/80 dark:border-slate-800 space-y-5">
          
          {/* Account Role Selector Tabs */}
          <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-2xl text-xs font-bold border border-slate-200/60 dark:border-slate-700/60">
            <button
              type="button"
              onClick={() => {
                setRole('USER');
                setValidationError('');
              }}
              className={`py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 transition-all ${
                role === 'USER'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <User className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>User Register</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setRole('ADMIN');
                setValidationError('');
              }}
              className={`py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 transition-all ${
                role === 'ADMIN'
                  ? 'bg-slate-900 text-amber-400 dark:bg-amber-950/80 dark:text-amber-300 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-amber-400" />
              <span>Admin Register</span>
            </button>
          </div>

          {/* Success Message */}
          {successMessage && (
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 flex items-center gap-2.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Error Message */}
          {(validationError || error) && (
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 space-y-2.5">
              <div className="flex items-center gap-2.5 text-xs font-semibold text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{typeof (validationError || error) === 'string' ? (validationError || error) : JSON.stringify(validationError || error)}</span>
              </div>
              
              {/* If account already exists */}
              {((error && typeof error === 'string' && (error.toLowerCase().includes('already exists') || error.toLowerCase().includes('account found'))) ||
                (validationError && validationError.toLowerCase().includes('already exists'))) && (
                <div className="pt-2 border-t border-rose-200/60 dark:border-rose-900/60 flex items-center gap-2">
                  <Link
                    to={`/login?email=${encodeURIComponent(formData.email)}`}
                    className="flex-1 py-2 px-3 text-center text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors"
                  >
                    Sign In with this Email
                  </Link>
                  <Link
                    to={`/login?email=${encodeURIComponent(formData.email)}&forgot=1`}
                    className="flex-1 py-2 px-3 text-center text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors"
                  >
                    Reset Password
                  </Link>
                </div>
              )}
            </div>
          )}


          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Username <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  name="username"
                  required
                  value={formData.username}
                  onChange={handleChange}
                  placeholder="e.g. johndoe"
                  className="w-full pl-10 pr-3.5 py-3 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all"
                />
              </div>
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Full Name</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleChange}
                  placeholder="Jane Doe"
                  className="w-full pl-10 pr-3.5 py-3 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all"
                />
              </div>
            </div>

            {/* Email Address */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Email Address (Optional)</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="jane@example.com"
                  className="w-full pl-10 pr-3.5 py-3 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all"
                />
              </div>
            </div>

            {/* Phone Number */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Phone Number (Optional)</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="+91 98490 12345"
                  className="w-full pl-10 pr-3.5 py-3 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="password"
                  name="password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Min 8 chars, 1 uppercase & 1 number"
                  className="w-full pl-10 pr-3.5 py-3 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all"
                />
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Confirm Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="password"
                  name="confirm_password"
                  required
                  value={formData.confirm_password}
                  onChange={handleChange}
                  placeholder="Re-enter password"
                  className="w-full pl-10 pr-3.5 py-3 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all"
                />
              </div>
            </div>

            {/* I agree with these terms - only for register page */}
            <div className="flex items-start gap-2.5 pt-1.5 pb-1">
              <input
                id="agree_terms"
                name="agree_terms"
                type="checkbox"
                required
                checked={agreeTerms}
                onChange={(e) => {
                  setAgreeTerms(e.target.checked);
                  if (validationError.toLowerCase().includes('terms')) {
                    setValidationError('');
                  }
                }}
                className="mt-0.5 w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500/20 cursor-pointer accent-blue-600 shrink-0"
              />
              <label
                htmlFor="agree_terms"
                className="text-xs text-slate-600 dark:text-slate-400 select-none cursor-pointer leading-tight"
              >
                I agree with these{' '}
                <button
                  type="button"
                  onClick={() => setShowTermsModal(true)}
                  className="font-bold text-blue-600 dark:text-blue-400 hover:underline inline cursor-pointer"
                >
                  Terms & Conditions
                </button>{' '}
                and Privacy Policy
              </label>
            </div>

            {role === 'ADMIN' && (
              <div>
                <label htmlFor="admin_code" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Admin secret code
                </label>
                <input
                  id="admin_code"
                  name="admin_code"
                  type="password"
                  autoComplete="off"
                  required
                  value={adminCode}
                  onChange={(e) => setAdminCode(e.target.value)}
                  placeholder="Provided by your system owner"
                  className="w-full px-3.5 py-3 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 transition-all"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3.5 px-4 text-xs font-black rounded-xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50 ${
                role === 'ADMIN'
                  ? 'bg-slate-900 hover:bg-slate-800 text-amber-400 shadow-slate-900/20'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-blue-500/25'
              }`}
            >
              <span>{loading ? 'Creating account...' : `Register as ${role === 'ADMIN' ? 'Administrator' : 'User'}`}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Login prompt */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
            Already registered?{' '}
            <Link to="/login" className="font-bold text-blue-600 dark:text-blue-400 hover:underline">
              Sign In to Your Account
            </Link>
          </div>
        </div>

        {/* Back to Home Button */}
        <div className="mt-6 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-full transition-all shadow-xs"
          >
            <ArrowLeft className="w-4 h-4 text-blue-600" />
            <span>Back to Home</span>
          </Link>
        </div>
      </div>

      {/* Terms & Conditions Modal */}
      {showTermsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Terms & Conditions</h3>
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg font-bold"
              >
                ✕
              </button>
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-3 leading-relaxed">
              <p>
                Welcome to <strong>Website Presence Detection</strong>. By registering an account, you agree to:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-slate-500 dark:text-slate-400">
                <li>Provide accurate account information and keep your credentials secure.</li>
                <li>Use location searches and business contact tools responsibly in accordance with applicable laws.</li>
                <li>Respect privacy rights when sending inquiries, WhatsApp messages, or website evaluation requests.</li>
                <li>Protect sensitive data and comply with local business regulations.</li>
              </ul>
              <p>
                We do not share your private account data with unauthorized third parties. For full policy details, contact support.
              </p>
            </div>
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="py-2 px-4 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setAgreeTerms(true);
                  if (validationError.toLowerCase().includes('terms')) setValidationError('');
                  setShowTermsModal(false);
                }}
                className="py-2 px-4 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs"
              >
                I Agree
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

