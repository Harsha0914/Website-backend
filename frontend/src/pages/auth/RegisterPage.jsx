import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { User, ShieldCheck, ArrowRight, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import AuthLayout from '../../components/layout/AuthLayout';

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

  const isAdmin = role === 'ADMIN';

  return (
    <AuthLayout
      title={isAdmin ? 'Create an administrator account' : 'Create your account'}
      subtitle={
        isAdmin
          ? 'Administrators can manage users, shops and reports. You need the admin secret code.'
          : 'It takes a minute. Then you can find nearby shops and see which ones need a website.'
      }
      footer={
        <p className="ui-help">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold underline" style={{ color: 'var(--ui-primary-text)' }}>Sign in</Link>
        </p>
      }
    >
      {/* Account type */}
      <div className="grid grid-cols-2 gap-2 mb-6" role="group" aria-label="Account type">
        {[
          { id: 'USER', label: 'Member', icon: User },
          { id: 'ADMIN', label: 'Administrator', icon: ShieldCheck },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => { setRole(id); setValidationError(''); }}
            aria-pressed={role === id}
            className={`ui-chip justify-center ${role === id ? 'ui-chip-active' : ''}`}
            style={{ minHeight: 44, borderRadius: 12 }}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {successMessage && (
        <div className="ui-notice ui-notice-success mb-5" role="status">
          <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{successMessage}</span>
        </div>
      )}
      {(validationError || error) && (
        <div className="ui-notice ui-notice-error mb-5" role="alert">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{validationError || (typeof error === 'string' ? error : 'Something went wrong. Please try again.')}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="reg-username" className="ui-label">Username</label>
          <input id="reg-username" name="username" type="text" autoComplete="username" value={formData.username} onChange={handleChange} placeholder="At least 3 characters" className="ui-input" />
        </div>
        <div>
          <label htmlFor="reg-full-name" className="ui-label">Full name <span className="ui-muted font-normal">(optional)</span></label>
          <input id="reg-full-name" name="full_name" type="text" autoComplete="name" value={formData.full_name} onChange={handleChange} className="ui-input" />
        </div>
        <div>
          <label htmlFor="reg-email" className="ui-label">E-mail <span className="ui-muted font-normal">(used to reset your password)</span></label>
          <input id="reg-email" name="email" type="email" autoComplete="email" value={formData.email} onChange={handleChange} placeholder="you@example.com" className="ui-input" />
        </div>
        <div>
          <label htmlFor="reg-phone" className="ui-label">Phone <span className="ui-muted font-normal">(optional)</span></label>
          <input id="reg-phone" name="phone" type="tel" autoComplete="tel" value={formData.phone} onChange={handleChange} className="ui-input" />
        </div>
        <div>
          <label htmlFor="reg-password" className="ui-label">Password</label>
          <input id="reg-password" name="password" type="password" autoComplete="new-password" value={formData.password} onChange={handleChange} className="ui-input" />
          <p className="ui-help mt-1.5">At least 8 characters, with an upper-case letter and a number.</p>
        </div>
        <div>
          <label htmlFor="reg-confirm" className="ui-label">Repeat password</label>
          <input id="reg-confirm" name="confirm_password" type="password" autoComplete="new-password" value={formData.confirm_password} onChange={handleChange} className="ui-input" />
        </div>

        {isAdmin && (
          <div>
            <label htmlFor="admin_code" className="ui-label">Admin secret code</label>
            <input id="admin_code" name="admin_code" type="password" autoComplete="off" value={adminCode} onChange={(e) => setAdminCode(e.target.value)} placeholder="Given to you by the system owner" className="ui-input" />
          </div>
        )}

        <label className="flex items-start gap-3 pt-1 cursor-pointer">
          <input
            id="agree_terms"
            name="agree_terms"
            type="checkbox"
            checked={agreeTerms}
            onChange={(e) => {
              setAgreeTerms(e.target.checked);
              if (validationError.toLowerCase().includes('terms')) setValidationError('');
            }}
            className="mt-1 h-5 w-5 rounded"
            style={{ accentColor: 'var(--ui-primary)' }}
          />
          <span className="text-sm" style={{ color: 'var(--ui-text-2)' }}>
            I agree to the{' '}
            <button type="button" onClick={() => setShowTermsModal(true)} className="font-semibold underline" style={{ color: 'var(--ui-primary-text)' }}>
              terms and conditions
            </button>
            .
          </span>
        </label>

        <button type="submit" disabled={loading} className="ui-btn ui-btn-primary ui-btn-lg ui-btn-block">
          {loading ? 'Creating account…' : isAdmin ? 'Create administrator account' : 'Create account'}
          {!loading && <ArrowRight className="h-5 w-5" aria-hidden="true" />}
        </button>
      </form>

      {showTermsModal && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(15, 23, 42, 0.5)' }}
          onClick={(e) => e.target === e.currentTarget && setShowTermsModal(false)}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="terms-title" className="ui-card w-full sm:max-w-md p-6 rounded-b-none sm:rounded-b-[14px]" style={{ boxShadow: 'var(--ui-shadow-lg)' }}>
            <div className="flex items-start justify-between gap-3">
              <h2 id="terms-title" className="ui-h2">Terms and conditions</h2>
              <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" style={{ width: 40, padding: 0 }} onClick={() => setShowTermsModal(false)} aria-label="Close">✕</button>
            </div>
            <div className="mt-3 space-y-3 text-sm" style={{ color: 'var(--ui-text-2)' }}>
              <p>Welcome to <strong>Website Presence Detection</strong>. By creating an account you agree to:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Give accurate account information and keep your password secure.</li>
                <li>Use location searches and business contact tools responsibly and lawfully.</li>
                <li>Respect people's privacy when sending enquiries, WhatsApp messages or website evaluation requests, and stop messaging anyone who asks you to.</li>
                <li>Protect sensitive data and follow local business regulations.</li>
              </ul>
              <p>We do not share your private account data with unauthorised third parties. For the full policy, contact support.</p>
            </div>
            <div className="mt-5 flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
              <button type="button" className="ui-btn ui-btn-secondary" onClick={() => setShowTermsModal(false)}>Close</button>
              <button
                type="button"
                className="ui-btn ui-btn-primary"
                onClick={() => {
                  setAgreeTerms(true);
                  if (validationError.toLowerCase().includes('terms')) setValidationError('');
                  setShowTermsModal(false);
                }}
              >
                I agree
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
