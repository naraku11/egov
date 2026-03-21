/**
 * @file AuthPage.jsx
 * @description Unified authentication page for the Aluguinsan E-Gov Portal.
 *
 * Handles three distinct flows within a single route (/auth):
 *
 *  1. Login   — Residents, public servants, and the admin all use the same
 *               `/auth/unified-login` endpoint. The API response includes a
 *               `type` field ('servant' | 'user') that determines which context
 *               setter is called and which route the user is redirected to.
 *
 *  2. Register — New resident registration. Collects name, optional email /
 *               phone, barangay, address, and password. On success the returned
 *               JWT is immediately stored via `loginUser()` so the user lands
 *               on their dashboard without a separate login step.
 *
 *  3. Forgot password — Two-step flow:
 *               Step 1: Submit email or phone → backend sends a 6-digit OTP.
 *               Step 2: Enter OTP + new password → password is reset and the
 *                       user is redirected back to the login tab.
 *
 * The active tab ('login' | 'register' | 'forgot') can be pre-selected via the
 * `?tab=register` query-string parameter so deep-links from LandingPage CTAs
 * drop the user on the correct form automatically.
 */

import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Eye, EyeOff, Phone, Mail, Lock, User, MapPin, ArrowLeft, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useLanguage } from '../contexts/LanguageContext.jsx';
import { barangays } from '../i18n/translations.js';

/**
 * AuthPage component.
 *
 * Reads the `?tab` query parameter on mount to set the initial active form.
 * All three forms share a single loading flag so buttons are disabled during
 * any in-flight API request, preventing duplicate submissions.
 *
 * @returns {JSX.Element} The authentication page with login, register, and
 *   forgot-password tabs.
 */
export default function AuthPage() {
  // Read the optional ?tab query param to pre-select login or register
  const [searchParams] = useSearchParams();

  // Active tab: 'login' | 'register' | 'forgot'
  const [tab, setTab] = useState(searchParams.get('tab') || 'login');

  // Toggle plain-text visibility for the login password field
  const [showPassword, setShowPassword] = useState(false);

  // Shared loading flag — covers all three form submission handlers
  const [loading, setLoading] = useState(false);

  // Auth context setters; loginServant stores a different key than loginUser
  const { loginUser, loginServant } = useAuth();

  const { t } = useLanguage();
  const navigate = useNavigate();

  // ── Login form state ────────────────────────────────────────────────────────
  const [loginData, setLoginData] = useState({ emailOrPhone: '', password: '' });

  // ── Registration form state ─────────────────────────────────────────────────
  const [regData, setRegData] = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '', barangay: '', address: '' });

  // ── Forgot-password multi-step state ────────────────────────────────────────
  /** Current step of the password-reset flow: 1 = request OTP, 2 = verify OTP + set new password */
  const [resetStep, setResetStep]             = useState(1);
  /** Email or phone entered by the user in step 1, also shown as confirmation in step 2 */
  const [resetContact, setResetContact]       = useState('');
  /** 6-digit numeric OTP received via email/SMS */
  const [resetCode, setResetCode]             = useState('');
  /** New password chosen during step 2 */
  const [resetNewPw, setResetNewPw]           = useState('');
  /** Confirmation copy of the new password (must match resetNewPw before submit) */
  const [resetConfirm, setResetConfirm]       = useState('');
  /** Toggle plain-text visibility for the new-password field in step 2 */
  const [showResetPw, setShowResetPw]         = useState(false);

  /**
   * Handles the Login form submission.
   * Calls the unified login endpoint which accepts both resident and servant
   * credentials. Redirects to /servant, /admin, or /dashboard based on the
   * type/role returned by the API.
   *
   * @param {React.FormEvent<HTMLFormElement>} e - Form submit event.
   */
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/auth/unified-login', {
        emailOrPhone: loginData.emailOrPhone,
        password: loginData.password,
      });
      if (data.type === 'servant') {
        // Store servant JWT and profile, then go to the servant dashboard
        loginServant(data.token, data.servant);
        toast.success(`Welcome, ${data.servant.name}!`);
        navigate('/servant');
      } else {
        // Store resident/admin JWT and profile
        loginUser(data.token, data.user);
        toast.success(`Welcome back, ${data.user.name}!`);
        // Admins go to /admin; regular residents go to /dashboard
        navigate(data.user.role === 'ADMIN' ? '/admin' : '/dashboard');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handles step 1 of the forgot-password flow — requests an OTP.
   * On success advances resetStep to 2 so the OTP entry form is shown.
   *
   * @param {React.FormEvent<HTMLFormElement>} e - Form submit event.
   */
  const handleForgotSend = async (e) => {
    e.preventDefault();
    if (!resetContact) return toast.error('Enter your email or phone number');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { emailOrPhone: resetContact });
      toast.success('Reset code sent — check your email or phone');
      setResetStep(2);
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handles step 2 of the forgot-password flow — verifies OTP and sets the
   * new password. On success resets all reset-state fields and returns the
   * user to the login tab.
   *
   * @param {React.FormEvent<HTMLFormElement>} e - Form submit event.
   */
  const handleForgotReset = async (e) => {
    e.preventDefault();
    if (resetNewPw.length < 6) return toast.error('Password must be at least 6 characters');
    if (resetNewPw !== resetConfirm) return toast.error('Passwords do not match');
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { emailOrPhone: resetContact, code: resetCode, newPassword: resetNewPw });
      toast.success('Password reset! Please log in.');
      // Return to login tab and clear all reset-flow state
      setTab('login');
      setResetStep(1);
      setResetContact(''); setResetCode(''); setResetNewPw(''); setResetConfirm('');
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handles the Register form submission.
   * Optional fields (email, phone, address) are omitted from the payload when
   * left blank so the backend does not receive empty strings.
   * On success the API returns a JWT and user object; loginUser() is called so
   * the user is immediately authenticated and redirected to their dashboard.
   *
   * @param {React.FormEvent<HTMLFormElement>} e - Form submit event.
   */
  const handleRegister = async (e) => {
    e.preventDefault();
    // Client-side validation before hitting the API
    if (regData.password !== regData.confirmPassword) {
      return toast.error('Passwords do not match');
    }
    if (!regData.barangay) return toast.error('Please select your barangay');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', {
        name: regData.name,
        email: regData.email || undefined,       // omit if empty
        phone: regData.phone || undefined,       // omit if empty
        password: regData.password,
        barangay: regData.barangay,
        address: regData.address || undefined,   // omit if empty
      });
      // Immediately log the new user in without a separate login step
      loginUser(data.token, data.user);
      toast.success('Registration successful! Welcome!');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-blue-50 flex flex-col">
      {/* Back-to-home link shown at the top of the page */}
      <div className="p-4">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Portal logo / branding block */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center text-white font-bold text-2xl mx-auto mb-3 shadow-lg">
              AG
            </div>
            <h1 className="text-xl font-bold text-gray-900">Aluguinsan E-Gov Portal</h1>
            <p className="text-sm text-gray-500">Municipality of Aluguinsan, Cebu</p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            {/* Tab switcher — only Login and Register are shown; 'forgot' is
                accessed via a link inside the Login form */}
            <div className="flex border-b border-gray-100">
              {[
                { id: 'login', label: t('login') },
                { id: 'register', label: t('register') },
              ].map(item => (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`flex-1 py-3 text-xs font-medium transition-colors ${
                    tab === item.id
                      ? 'text-primary-600 border-b-2 border-primary-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="p-6">
              {/* ── Login Form ────────────────────────────────────────────────
                  Accepts email or PH mobile number plus password.
                  A "Forgot password?" link switches the tab to 'forgot'.
              ──────────────────────────────────────────────────────────────── */}
              {tab === 'login' && (
                <form onSubmit={handleLogin} className="space-y-4">
                  <h2 className="text-lg font-semibold text-gray-900">{t('welcomeBack')}</h2>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('emailOrPhone')}</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        className="input-field pl-10"
                        placeholder="email@example.com or 09xxxxxxxxx"
                        value={loginData.emailOrPhone}
                        onChange={e => setLoginData({ ...loginData, emailOrPhone: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('password')}</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className="input-field pl-10 pr-10"
                        placeholder="••••••••"
                        value={loginData.password}
                        onChange={e => setLoginData({ ...loginData, password: e.target.value })}
                        required
                      />
                      {/* Eye toggle for the password field */}
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
                    {loading ? t('loading') : t('login')}
                  </button>

                  {/* Forgot password link — switches to the forgot tab and resets to step 1 */}
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => { setTab('forgot'); setResetStep(1); }}
                      className="text-sm text-primary-600 hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <p className="text-center text-sm text-gray-600">
                    {t('dontHaveAccount')}{' '}
                    <button type="button" onClick={() => setTab('register')} className="text-primary-600 font-medium hover:underline">
                      {t('register')}
                    </button>
                  </p>
                </form>
              )}

              {/* ── Forgot Password Flow ──────────────────────────────────────
                  Step 1: Enter email/phone → OTP is sent.
                  Step 2: Enter OTP + new password → password is updated.
              ──────────────────────────────────────────────────────────────── */}
              {tab === 'forgot' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    {/* Back arrow returns to login and resets step counter */}
                    <button
                      type="button"
                      onClick={() => { setTab('login'); setResetStep(1); }}
                      className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4 text-gray-500" />
                    </button>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {resetStep === 1 ? 'Forgot Password' : 'Set New Password'}
                    </h2>
                  </div>

                  {/* Step 1: request OTP */}
                  {resetStep === 1 ? (
                    <form onSubmit={handleForgotSend} className="space-y-4">
                      <p className="text-sm text-gray-500">
                        Enter the email or phone number linked to your account and we will send you a reset code.
                      </p>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email or Phone</label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                          <input
                            type="text"
                            className="input-field pl-10"
                            placeholder="email@example.com or 09xxxxxxxxx"
                            value={resetContact}
                            onChange={e => setResetContact(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                      <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
                        {loading ? 'Sending...' : 'Send Reset Code'}
                      </button>
                    </form>
                  ) : (
                    /* Step 2: verify OTP and set new password */
                    <form onSubmit={handleForgotReset} className="space-y-4">
                      <p className="text-sm text-gray-500">
                        Enter the 6-digit code sent to <span className="font-medium text-gray-700">{resetContact}</span>.
                      </p>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Reset Code</label>
                        <div className="relative">
                          <KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                          {/* inputMode="numeric" shows the numeric keyboard on mobile;
                              non-digit characters are stripped via replace */}
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            className="input-field pl-10 tracking-widest font-mono"
                            placeholder="000000"
                            value={resetCode}
                            onChange={e => setResetCode(e.target.value.replace(/\D/g, ''))}
                            required
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                          <input
                            type={showResetPw ? 'text' : 'password'}
                            className="input-field pl-10 pr-10"
                            placeholder="Min. 6 characters"
                            value={resetNewPw}
                            onChange={e => setResetNewPw(e.target.value)}
                            required
                            minLength={6}
                          />
                          {/* Eye toggle for the new-password field */}
                          <button type="button" onClick={() => setShowResetPw(s => !s)} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
                            {showResetPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                        <input
                          type="password"
                          className="input-field"
                          placeholder="Re-enter new password"
                          value={resetConfirm}
                          onChange={e => setResetConfirm(e.target.value)}
                          required
                        />
                      </div>
                      <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
                        {loading ? 'Resetting...' : 'Reset Password'}
                      </button>
                      {/* "Resend code" returns to step 1 so the user can request a fresh OTP */}
                      <div className="text-center">
                        <button
                          type="button"
                          onClick={() => setResetStep(1)}
                          className="text-sm text-gray-500 hover:text-primary-600"
                        >
                          Resend code
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* ── Registration Form ─────────────────────────────────────────
                  Collects the minimum required resident profile. Email and
                  phone are both optional but at least one should be provided
                  for future communication. Barangay is required for correct
                  routing of concerns within the municipality.
              ──────────────────────────────────────────────────────────────── */}
              {tab === 'register' && (
                <form onSubmit={handleRegister} className="space-y-4">
                  <h2 className="text-lg font-semibold text-gray-900">{t('createAccount')}</h2>
                  {/* Full name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('fullName')} *</label>
                    <div className="relative">
                      <User className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                      <input type="text" className="input-field pl-10" placeholder="Juan Dela Cruz" value={regData.name}
                        onChange={e => setRegData({ ...regData, name: e.target.value })} required />
                    </div>
                  </div>
                  {/* Email and phone side-by-side (both optional) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('email')}</label>
                      <input type="email" className="input-field" placeholder="email@example.com" value={regData.email}
                        onChange={e => setRegData({ ...regData, email: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('phone')}</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                        <input type="tel" className="input-field pl-10" placeholder="09xxxxxxxxx" value={regData.phone}
                          onChange={e => setRegData({ ...regData, phone: e.target.value })} />
                      </div>
                    </div>
                  </div>
                  {/* Barangay — required; options sourced from the translations file */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('barangay')} *</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                      <select className="input-field pl-10" value={regData.barangay}
                        onChange={e => setRegData({ ...regData, barangay: e.target.value })} required>
                        <option value="">Select Barangay</option>
                        {barangays.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                  </div>
                  {/* Optional street/purok address */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('address')}</label>
                    <input type="text" className="input-field" placeholder="Street, Purok..." value={regData.address}
                      onChange={e => setRegData({ ...regData, address: e.target.value })} />
                  </div>
                  {/* Password and confirmation side-by-side */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('password')} *</label>
                      <input type="password" className="input-field" placeholder="min 6 chars" value={regData.password}
                        onChange={e => setRegData({ ...regData, password: e.target.value })} required minLength={6} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t('confirmPassword')} *</label>
                      <input type="password" className="input-field" placeholder="••••••" value={regData.confirmPassword}
                        onChange={e => setRegData({ ...regData, confirmPassword: e.target.value })} required />
                    </div>
                  </div>
                  <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
                    {loading ? t('loading') : t('createAccount')}
                  </button>
                  <p className="text-center text-sm text-gray-600">
                    {t('alreadyHaveAccount')}{' '}
                    <button type="button" onClick={() => setTab('login')} className="text-primary-600 font-medium hover:underline">
                      {t('login')}
                    </button>
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
