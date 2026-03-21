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

import { useState, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Eye, EyeOff, Phone, Mail, Lock, User, MapPin, ArrowLeft, KeyRound, Smartphone } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useLanguage } from '../contexts/LanguageContext.jsx';
import { barangays } from '../i18n/translations.js';
import { auth, RecaptchaVerifier, signInWithPhoneNumber } from '../lib/firebase.js';

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

  // ── Auth OTP verification state (for citizens after login/register) ────────
  /** User ID returned by backend after credentials are validated */
  const [pendingUserId, setPendingUserId]     = useState(null);
  /** Which channels the OTP was sent to */
  const [otpSentTo, setOtpSentTo]             = useState({ email: false, phone: false });
  /** 6-digit auth OTP code entered by user */
  const [authOtpCode, setAuthOtpCode]         = useState('');
  /** Phone number from backend for Firebase SMS verification */
  const [pendingPhone, setPendingPhone]       = useState(null);
  /** True while Firebase SMS is being sent */
  const [sendingSms, setSendingSms]           = useState(false);
  /** Firebase confirmation result for auth OTP SMS flow */
  const smsConfirmRef                         = useRef(null);
  /** Step: 'choose' = show options, 'sms-sent' = waiting for SMS code */
  const [smsStep, setSmsStep]                 = useState(null);

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

  // ── Phone OTP (Firebase) state ────────────────────────────────────────────
  /** Phone number input for OTP login */
  const [otpPhone, setOtpPhone]               = useState('');
  /** Current step: 1 = enter phone, 2 = enter OTP code */
  const [otpStep, setOtpStep]                 = useState(1);
  /** Firebase confirmation result for OTP verification */
  const confirmationResultRef                 = useRef(null);
  /** 6-digit OTP code entered by user */
  const [otpCode, setOtpCode]                 = useState('');
  /** reCAPTCHA verifier instance */
  const recaptchaRef                          = useRef(null);

  /**
   * Clears any existing reCAPTCHA widget and resets the ref.
   * Replaces the DOM node entirely to avoid "already rendered" errors.
   */
  const clearRecaptcha = useCallback(() => {
    if (recaptchaRef.current) {
      try { recaptchaRef.current.clear(); } catch { /* ignore */ }
      recaptchaRef.current = null;
    }
    // Replace the container node entirely so grecaptcha loses its reference
    const el = document.getElementById('recaptcha-container');
    if (el) {
      const fresh = document.createElement('div');
      fresh.id = 'recaptcha-container';
      el.replaceWith(fresh);
    }
  }, []);

  /**
   * Returns a ready reCAPTCHA verifier, always creating a fresh one.
   */
  const getRecaptcha = useCallback(() => {
    // Always start fresh — destroy any previous instance
    if (recaptchaRef.current) {
      try { recaptchaRef.current.clear(); } catch { /* ignore */ }
      recaptchaRef.current = null;
    }
    // Replace the container to guarantee a clean DOM node
    const el = document.getElementById('recaptcha-container');
    if (el) {
      const fresh = document.createElement('div');
      fresh.id = 'recaptcha-container';
      el.replaceWith(fresh);
    }
    recaptchaRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
      callback: () => { /* reCAPTCHA solved */ },
    });
    return recaptchaRef.current;
  }, []);

  /**
   * Step 1: Send SMS OTP via Firebase.
   * Converts local PH format (09xx) to international (+639xx).
   */
  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!otpPhone) return toast.error('Enter your phone number');

    // Convert 09xx to +639xx for Firebase
    let phoneForFirebase = otpPhone.trim();
    if (phoneForFirebase.startsWith('09')) {
      phoneForFirebase = '+63' + phoneForFirebase.slice(1);
    } else if (!phoneForFirebase.startsWith('+')) {
      phoneForFirebase = '+63' + phoneForFirebase;
    }

    setLoading(true);
    try {
      const verifier = getRecaptcha();
      const confirmation = await signInWithPhoneNumber(auth, phoneForFirebase, verifier);
      confirmationResultRef.current = confirmation;
      setOtpStep(2);
      toast.success('OTP sent! Check your phone.');
    } catch (err) {
      console.error('OTP send error:', err);
      if (err.code === 'auth/too-many-requests') {
        toast.error('Too many attempts. Try again later.');
      } else if (err.code === 'auth/invalid-phone-number') {
        toast.error('Invalid phone number format');
      } else {
        toast.error(err.message || 'Failed to send OTP');
      }
      clearRecaptcha();
    } finally {
      setLoading(false);
    }
  };

  /**
   * Step 2: Verify the OTP code with Firebase, then exchange the Firebase
   * ID token for our own JWT via the backend.
   */
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otpCode || otpCode.length !== 6) return toast.error('Enter the 6-digit code');
    if (!confirmationResultRef.current) return toast.error('Please request OTP first');

    setLoading(true);
    try {
      // Verify OTP with Firebase
      const result = await confirmationResultRef.current.confirm(otpCode);
      const idToken = await result.user.getIdToken();

      // Exchange Firebase token for our JWT
      const { data } = await api.post('/auth/firebase/verify-phone', { idToken });

      loginUser(data.token, data.user);
      toast.success(`Welcome, ${data.user.name}!`);
      navigate(data.user.role === 'ADMIN' ? '/admin' : '/dashboard');
    } catch (err) {
      console.error('OTP verify error:', err);
      if (err.code === 'auth/invalid-verification-code') {
        toast.error('Invalid OTP code. Please try again.');
      } else {
        toast.error(err.response?.data?.error || err.message || 'Verification failed');
      }
    } finally {
      setLoading(false);
    }
  };

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

      // Citizens require OTP verification
      if (data.requiresOtp) {
        setPendingUserId(data.userId);
        setOtpSentTo(data.sentTo);
        setPendingPhone(data.phone || null);
        setAuthOtpCode('');
        setSmsStep(null);
        smsConfirmRef.current = null;
        clearRecaptcha();
        setTab('verify-otp');
        toast.success(data.phone ? 'Verify via SMS to continue' : 'Verification code sent to your email');
        return;
      }

      if (data.type === 'servant') {
        loginServant(data.token, data.servant);
        toast.success(`Welcome, ${data.servant.name}!`);
        navigate('/servant');
      } else {
        loginUser(data.token, data.user);
        toast.success(`Welcome back, ${data.user.name}!`);
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

      // Citizens must verify OTP before accessing the system
      if (data.requiresOtp) {
        setPendingUserId(data.userId);
        setOtpSentTo(data.sentTo);
        setPendingPhone(data.phone || null);
        setAuthOtpCode('');
        setSmsStep(null);
        smsConfirmRef.current = null;
        clearRecaptcha();
        setTab('verify-otp');
        toast.success(data.phone ? 'Verify via SMS to continue' : 'Verification code sent to your email');
        return;
      }

      loginUser(data.token, data.user);
      toast.success('Registration successful! Welcome!');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Verifies the 6-digit auth OTP after login or registration.
   */
  const handleVerifyAuthOtp = async (e) => {
    e.preventDefault();
    if (!authOtpCode || authOtpCode.length !== 6) return toast.error('Enter the 6-digit code');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/verify-auth-otp', {
        userId: pendingUserId,
        otp: authOtpCode,
      });
      loginUser(data.token, data.user);
      toast.success(`Welcome, ${data.user.name}!`);
      navigate(data.user.role === 'ADMIN' ? '/admin' : '/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Resends the auth OTP to the user's email/phone.
   */
  const handleResendAuthOtp = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/resend-otp', { userId: pendingUserId });
      setOtpSentTo(data.sentTo);
      toast.success('Verification code resent to your email');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to resend OTP');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Sends SMS OTP via Firebase Phone Auth for the auth verification flow.
   */
  const handleSendAuthSms = async () => {
    if (!pendingPhone) return;
    setSendingSms(true);
    try {
      const verifier = getRecaptcha();
      // Convert 09xx to +639xx for Firebase
      const intlPhone = pendingPhone.startsWith('0')
        ? '+63' + pendingPhone.slice(1)
        : pendingPhone.startsWith('+') ? pendingPhone : '+63' + pendingPhone;

      const confirmation = await signInWithPhoneNumber(auth, intlPhone, verifier);
      smsConfirmRef.current = confirmation;
      setSmsStep('sms-sent');
      toast.success('SMS code sent to your phone');
    } catch (err) {
      console.error('Firebase SMS error:', err);
      toast.error(err.message || 'Failed to send SMS');
      clearRecaptcha();
    } finally {
      setSendingSms(false);
    }
  };

  /**
   * Verifies the Firebase SMS code and completes the login/register flow.
   */
  const handleVerifyAuthSms = async (e) => {
    e.preventDefault();
    if (!authOtpCode || authOtpCode.length !== 6) return toast.error('Enter the 6-digit SMS code');
    setLoading(true);
    try {
      // Verify SMS code with Firebase
      const credential = await smsConfirmRef.current.confirm(authOtpCode);
      const idToken = await credential.user.getIdToken();

      // Send to backend to complete the auth flow
      const { data } = await api.post('/auth/verify-phone-otp', {
        userId: pendingUserId,
        idToken,
      });

      loginUser(data.token, data.user);
      toast.success(`Welcome, ${data.user.name}!`);
      navigate(data.user.role === 'ADMIN' ? '/admin' : '/dashboard');
    } catch (err) {
      if (err.code === 'auth/invalid-verification-code') {
        toast.error('Invalid SMS code. Please try again.');
      } else {
        toast.error(err.response?.data?.error || err.message || 'Verification failed');
      }
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

      {/* Invisible reCAPTCHA container for Firebase Phone Auth */}
      <div id="recaptcha-container"></div>

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
                        placeholder="email@gmail.com.com or 09xxxxxxxxx"
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
                  {/* Divider */}
                  <div className="relative my-2">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
                    <div className="relative flex justify-center text-xs"><span className="bg-white px-3 text-gray-400">or</span></div>
                  </div>

                  {/* Login with Phone OTP button */}
                  <button
                    type="button"
                    onClick={() => { setTab('phone-otp'); setOtpStep(1); setOtpCode(''); }}
                    className="w-full py-2.5 border-2 border-primary-200 text-primary-600 rounded-lg font-medium text-sm hover:bg-primary-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <Smartphone className="w-4 h-4" />
                    Login with Phone OTP
                  </button>

                  <p className="text-center text-sm text-gray-600">
                    {t('dontHaveAccount')}{' '}
                    <button type="button" onClick={() => setTab('register')} className="text-primary-600 font-medium hover:underline">
                      {t('register')}
                    </button>
                  </p>
                </form>
              )}

              {/* ── Phone OTP Login Flow ───────────────────────────────────────
                  Step 1: Enter phone → Firebase sends SMS OTP.
                  Step 2: Enter 6-digit OTP → verified and logged in.
              ──────────────────────────────────────────────────────────────── */}
              {tab === 'phone-otp' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { setTab('login'); setOtpStep(1); setOtpCode(''); }}
                      className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4 text-gray-500" />
                    </button>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {otpStep === 1 ? 'Phone Login' : 'Enter OTP Code'}
                    </h2>
                  </div>

                  {otpStep === 1 ? (
                    <form onSubmit={handleSendOtp} className="space-y-4">
                      <p className="text-sm text-gray-500">
                        We'll send a one-time code to your phone number via SMS.
                      </p>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                          <input
                            type="tel"
                            className="input-field pl-10"
                            placeholder="09xxxxxxxxx"
                            value={otpPhone}
                            onChange={e => setOtpPhone(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                      <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
                        {loading ? 'Sending OTP...' : 'Send OTP'}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleVerifyOtp} className="space-y-4">
                      <p className="text-sm text-gray-500">
                        Enter the 6-digit code sent to <span className="font-medium text-gray-700">{otpPhone}</span>
                      </p>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">OTP Code</label>
                        <div className="relative">
                          <KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            className="input-field pl-10 tracking-widest font-mono"
                            placeholder="000000"
                            value={otpCode}
                            onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                            required
                          />
                        </div>
                      </div>
                      <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
                        {loading ? 'Verifying...' : 'Verify & Login'}
                      </button>
                      <div className="text-center">
                        <button
                          type="button"
                          onClick={() => { setOtpStep(1); setOtpCode(''); }}
                          className="text-sm text-gray-500 hover:text-primary-600"
                        >
                          Use a different number
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* ── Auth OTP Verification ─────────────────────────────────────
                  Shown after login or registration for citizen accounts.
                  The user must enter the 6-digit OTP sent to email/phone.
              ──────────────────────────────────────────────────────────────── */}
              {tab === 'verify-otp' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { setTab('login'); setPendingUserId(null); setAuthOtpCode(''); setSmsStep(null); clearRecaptcha(); }}
                      className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4 text-gray-500" />
                    </button>
                    <h2 className="text-lg font-semibold text-gray-900">Verify Your Identity</h2>
                  </div>

                  {/* ── PRIMARY: SMS via Firebase (when user has phone) ──────── */}
                  {pendingPhone && smsStep !== 'sms-sent' && (
                    <>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p className="text-sm text-blue-700 flex items-center gap-1.5">
                          <Smartphone className="w-4 h-4" />
                          We'll send an SMS verification code to your phone number.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleSendAuthSms}
                        disabled={sendingSms}
                        className="btn-primary w-full py-2.5 flex items-center justify-center gap-2"
                      >
                        <Smartphone className="w-4 h-4" />
                        {sendingSms ? 'Sending SMS...' : 'Send SMS Code'}
                      </button>
                    </>
                  )}

                  {/* SMS code entry — shown after Firebase sends the SMS */}
                  {smsStep === 'sms-sent' && (
                    <>
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <p className="text-sm text-green-700 flex items-center gap-1.5">
                          <Smartphone className="w-4 h-4" />
                          SMS code sent to {pendingPhone}
                        </p>
                      </div>

                      <form onSubmit={handleVerifyAuthSms} className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">SMS Verification Code</label>
                          <div className="relative">
                            <KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={6}
                              className="input-field pl-10 tracking-widest font-mono text-center text-lg"
                              placeholder="000000"
                              value={authOtpCode}
                              onChange={e => setAuthOtpCode(e.target.value.replace(/\D/g, ''))}
                              autoFocus
                              required
                            />
                          </div>
                        </div>
                        <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
                          {loading ? 'Verifying...' : 'Verify & Continue'}
                        </button>
                        <div className="text-center">
                          <button
                            type="button"
                            onClick={() => { setSmsStep(null); setAuthOtpCode(''); clearRecaptcha(); }}
                            className="text-sm text-gray-500 hover:text-primary-600"
                          >
                            Resend SMS code
                          </button>
                        </div>
                      </form>
                    </>
                  )}

                  {/* ── FALLBACK: Email OTP (when no phone number) ───────────── */}
                  {!pendingPhone && otpSentTo.email && (
                    <>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p className="text-sm text-blue-700 flex items-center gap-1.5">
                          <Mail className="w-4 h-4" />
                          A verification code has been sent to your email address.
                        </p>
                        <p className="text-xs text-blue-600 mt-1">Check your inbox and spam folder. The code expires in 5 minutes.</p>
                      </div>

                      <form onSubmit={handleVerifyAuthOtp} className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Email Verification Code</label>
                          <div className="relative">
                            <KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={6}
                              className="input-field pl-10 tracking-widest font-mono text-center text-lg"
                              placeholder="000000"
                              value={authOtpCode}
                              onChange={e => setAuthOtpCode(e.target.value.replace(/\D/g, ''))}
                              autoFocus
                              required
                            />
                          </div>
                        </div>
                        <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
                          {loading ? 'Verifying...' : 'Verify & Continue'}
                        </button>
                        <div className="text-center">
                          <button
                            type="button"
                            onClick={handleResendAuthOtp}
                            disabled={loading}
                            className="text-sm text-gray-500 hover:text-primary-600"
                          >
                            Didn't receive the code? Resend
                          </button>
                        </div>
                      </form>
                    </>
                  )}

                  {/* No contact info at all */}
                  {!pendingPhone && !otpSentTo.email && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                      No phone or email on your account. Please contact admin.
                    </div>
                  )}
                </div>
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
                            placeholder="email@gmail.com or 09xxxxxxxxx"
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
