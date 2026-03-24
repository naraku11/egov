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

import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Eye, EyeOff, Phone, Mail, Lock, User, MapPin, ArrowLeft, KeyRound, Smartphone, Shield, FileText, MessageSquare, Camera, CheckCircle, AlertTriangle, X } from 'lucide-react';
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
  const [idPhoto, setIdPhoto] = useState(null);
  const [idPreview, setIdPreview] = useState(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [idVerification, setIdVerification] = useState(null); // null | { isValid, idType, nameOnId, confidence, reason }
  const [idVerifying, setIdVerifying] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // Cleanup camera stream on unmount to prevent battery drain / camera indicator
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

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
  // ── Camera capture for ID photo ────────────────────────────────────────────
  const startCamera = async () => {
    // Check API availability first
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Camera not supported on this browser. Please upload a file instead.');
      return;
    }
    try {
      // Try rear camera first, fall back to any camera (iOS/desktop may not have environment)
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }
      streamRef.current = stream;
      setCameraOpen(true);
      // Wait for the video element to render, then attach stream
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => videoRef.current?.play().catch(() => {});
        }
      });
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        toast.error('Camera permission denied. Check your browser settings or upload a file instead.');
      } else {
        toast.error('Could not access camera. Please upload a file instead.');
      }
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    // Ensure video has loaded frames before capturing
    if (!video.videoWidth || !video.videoHeight) {
      toast.error('Camera not ready yet. Please wait a moment and try again.');
      return;
    }
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `id-capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
      setIdPhoto(file);
      setIdPreview(URL.createObjectURL(blob));
      setIdVerification(null);
      stopCamera();
    }, 'image/jpeg', 0.85);
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  };

  // ── ID Verification via API ───────────────────────────────────────────────
  const verifyId = async () => {
    if (!idPhoto) return toast.error('Please upload or capture an ID photo first');
    if (!regData.name) return toast.error('Please enter your name first so we can verify it against the ID');
    setIdVerifying(true);
    setIdVerification(null);
    try {
      const formData = new FormData();
      formData.append('idPhoto', idPhoto);
      formData.append('name', regData.name);
      const { data } = await api.post('/auth/verify-id', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setIdVerification(data);
      if (data.isValid) {
        toast.success(`ID verified: ${data.idType} (${data.confidence}% confidence)`);
      } else {
        toast.error(data.reason || 'ID verification failed. Please upload a clear photo of a valid government ID.');
      }
    } catch (err) {
      toast.error('Verification service error. You can proceed and your ID will be reviewed manually.');
      setIdVerification({ isValid: true, needsManualReview: true, reason: 'Service unavailable — manual review required.' });
    } finally {
      setIdVerifying(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    // Client-side validation before hitting the API
    if (regData.password !== regData.confirmPassword) {
      return toast.error('Passwords do not match');
    }
    if (!regData.barangay) return toast.error('Please select your barangay');
    if (!idPhoto) return toast.error('Please upload a valid ID photo for verification');
    if (!idVerification?.isValid) return toast.error('Please verify your ID first by clicking the "Verify ID" button');
    if (!agreedToTerms) return toast.error('Please agree to the Terms and Conditions');
    setLoading(true);
    try {
      // Use FormData to send the ID photo file along with registration fields
      const formData = new FormData();
      formData.append('name', regData.name);
      if (regData.email) formData.append('email', regData.email);
      if (regData.phone) formData.append('phone', regData.phone);
      formData.append('password', regData.password);
      formData.append('barangay', regData.barangay);
      if (regData.address) formData.append('address', regData.address);
      formData.append('idPhoto', idPhoto);

      const { data } = await api.post('/auth/register', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
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
      clearRecaptcha();
      // SMS failed — auto-fallback to email
      toast.error('SMS unavailable. Sending to email instead...');
      handleFallbackToEmail();
    } finally {
      setSendingSms(false);
    }
  };

  /**
   * Fallback: request backend to send email OTP instead of SMS.
   */
  const handleFallbackToEmail = async () => {
    try {
      await api.post('/auth/resend-otp', { userId: pendingUserId, forceEmail: true });
      setOtpSentTo({ email: true, phone: false });
      setPendingPhone(null);
      setSmsStep(null);
      toast.success('Verification code sent to your email');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send email OTP');
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
    <div className="min-h-screen flex">
      {/* ── Left branding panel — visible on lg+ ─────────────────────── */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[520px] bg-gradient-to-br from-primary-700 via-primary-600 to-blue-700 relative overflow-hidden flex-col justify-between p-10 text-white">
        {/* Decorative circles */}
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-white/5 rounded-full" />
        <div className="absolute -bottom-32 -left-16 w-96 h-96 bg-white/5 rounded-full" />
        <div className="absolute top-1/2 right-10 w-32 h-32 bg-white/5 rounded-full" />

        <div className="relative z-10">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors mb-12">
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          <div className="w-16 h-16 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center text-white font-bold text-2xl mb-6 border border-white/20">
            AG
          </div>
          <h1 className="text-3xl font-bold mb-3">Aluguinsan E-Gov Portal</h1>
          <p className="text-primary-100 text-base leading-relaxed">
            Your digital gateway to municipal services. Submit concerns, track progress, and connect with your local government — all in one place.
          </p>
        </div>

        {/* Feature highlights */}
        <div className="relative z-10 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium">Submit Concerns</p>
              <p className="text-xs text-primary-200">Report issues directly to departments</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium">Real-time Updates</p>
              <p className="text-xs text-primary-200">Track your ticket status anytime</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-medium">Secure & Verified</p>
              <p className="text-xs text-primary-200">OTP-protected citizen accounts</p>
            </div>
          </div>
        </div>

        <p className="relative z-10 text-xs text-primary-200">
          Municipality of Aluguinsan, Cebu
        </p>
      </div>

      {/* ── Right form panel ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-gradient-to-br from-gray-50 via-white to-primary-50/30">
        {/* Mobile-only header */}
        <div className="lg:hidden p-4 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-primary-600 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>

        {/* Invisible reCAPTCHA container for Firebase Phone Auth */}
        <div id="recaptcha-container"></div>

        <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-md">
            {/* Portal logo / branding block — compact on desktop (shown on left), full on mobile */}
            <div className="text-center mb-6">
              <div className="lg:hidden w-14 h-14 bg-primary-600 rounded-2xl flex items-center justify-center text-white font-bold text-xl mx-auto mb-3 shadow-lg shadow-primary-600/30">
                AG
              </div>
              <h1 className="text-xl font-bold text-gray-900 lg:text-2xl">
                <span className="hidden lg:inline">Welcome Back</span>
                <span className="lg:hidden">Aluguinsan E-Gov Portal</span>
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                <span className="hidden lg:inline">Sign in to access your account</span>
                <span className="lg:hidden">Municipality of Aluguinsan, Cebu</span>
              </p>
            </div>

            <div className="bg-white rounded-2xl shadow-lg shadow-gray-200/50 border border-gray-100 overflow-hidden">
              {/* Tab switcher */}
              <div className="flex border-b border-gray-100 bg-gray-50/50">
                {[
                  { id: 'login', label: t('login') },
                  { id: 'register', label: t('register') },
                ].map(item => (
                  <button
                    key={item.id}
                    onClick={() => setTab(item.id)}
                    className={`flex-1 py-3.5 text-sm font-medium transition-all relative ${
                      tab === item.id
                        ? 'text-primary-600'
                        : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    {item.label}
                    {tab === item.id && (
                      <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-primary-600 rounded-full" />
                    )}
                  </button>
                ))}
              </div>

              <div className="p-6 sm:p-8">
              {/* ── Login Form ────────────────────────────────────────────────
                  Accepts email or PH mobile number plus password.
                  A "Forgot password?" link switches the tab to 'forgot'.
              ──────────────────────────────────────────────────────────────── */}
              {tab === 'login' && (
                <form onSubmit={handleLogin} className="space-y-5">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{t('welcomeBack')}</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Enter your credentials to continue</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('emailOrPhone')}</label>
                    <div className="relative group">
                      <div className="absolute left-3 top-2.5 w-5 h-5 rounded bg-primary-50 flex items-center justify-center group-focus-within:bg-primary-100 transition-colors">
                        <Mail className="w-3.5 h-3.5 text-primary-500" />
                      </div>
                      <input
                        type="text"
                        className="input-field pl-11 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                        placeholder="email@example.com or 09xxxxxxxxx"
                        value={loginData.emailOrPhone}
                        onChange={e => setLoginData({ ...loginData, emailOrPhone: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-sm font-medium text-gray-700">{t('password')}</label>
                      <button
                        type="button"
                        onClick={() => { setTab('forgot'); setResetStep(1); }}
                        className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative group">
                      <div className="absolute left-3 top-2.5 w-5 h-5 rounded bg-primary-50 flex items-center justify-center group-focus-within:bg-primary-100 transition-colors">
                        <Lock className="w-3.5 h-3.5 text-primary-500" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className="input-field pl-11 pr-10 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                        placeholder="••••••••"
                        value={loginData.password}
                        onChange={e => setLoginData({ ...loginData, password: e.target.value })}
                        required
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 transition-colors">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-sm font-semibold shadow-lg shadow-primary-600/25 hover:shadow-primary-600/40 transition-all">
                    {loading ? t('loading') : t('login')}
                  </button>

                  {/* Divider */}
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
                    <div className="relative flex justify-center text-xs"><span className="bg-white px-3 text-gray-400 uppercase tracking-wider">or</span></div>
                  </div>

                  {/* Login with Phone OTP button */}
                  <button
                    type="button"
                    onClick={() => { setTab('phone-otp'); setOtpStep(1); setOtpCode(''); }}
                    className="w-full py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium text-sm hover:bg-gray-50 hover:border-gray-300 active:bg-gray-100 transition-all flex items-center justify-center gap-2"
                  >
                    <Smartphone className="w-4 h-4 text-primary-500" />
                    Login with Phone OTP
                  </button>

                  <p className="text-center text-sm text-gray-500">
                    {t('dontHaveAccount')}{' '}
                    <button type="button" onClick={() => setTab('register')} className="text-primary-600 font-semibold hover:underline">
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

                  {/* ── SMS via Firebase (when backend says phone is primary) ──── */}
                  {otpSentTo.phone && !otpSentTo.email && pendingPhone && smsStep !== 'sms-sent' && (
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
                      <div className="text-center">
                        <button type="button" onClick={handleFallbackToEmail} className="text-sm text-gray-500 hover:text-primary-600">
                          Send to email instead
                        </button>
                      </div>
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

                  {/* ── Email OTP (when backend sent email verification) ──────── */}
                  {otpSentTo.email && (
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
                  {!otpSentTo.phone && !otpSentTo.email && (
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
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{t('createAccount')}</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Fill in your details to get started</p>
                  </div>

                  {/* Full name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('fullName')} <span className="text-red-400">*</span></label>
                    <div className="relative group">
                      <div className="absolute left-3 top-2.5 w-5 h-5 rounded bg-primary-50 flex items-center justify-center group-focus-within:bg-primary-100 transition-colors">
                        <User className="w-3.5 h-3.5 text-primary-500" />
                      </div>
                      <input type="text" className="input-field pl-11 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" placeholder="Juan Dela Cruz" value={regData.name}
                        onChange={e => setRegData({ ...regData, name: e.target.value })} required />
                    </div>
                  </div>

                  {/* Email and phone */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('email')}</label>
                      <div className="relative group">
                        <div className="absolute left-3 top-2.5 w-5 h-5 rounded bg-blue-50 flex items-center justify-center group-focus-within:bg-blue-100 transition-colors">
                          <Mail className="w-3.5 h-3.5 text-blue-500" />
                        </div>
                        <input type="email" className="input-field pl-11 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" placeholder="email@example.com" value={regData.email}
                          onChange={e => setRegData({ ...regData, email: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('phone')}</label>
                      <div className="relative group">
                        <div className="absolute left-3 top-2.5 w-5 h-5 rounded bg-green-50 flex items-center justify-center group-focus-within:bg-green-100 transition-colors">
                          <Phone className="w-3.5 h-3.5 text-green-500" />
                        </div>
                        <input type="tel" className="input-field pl-11 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" placeholder="09xxxxxxxxx" value={regData.phone}
                          onChange={e => setRegData({ ...regData, phone: e.target.value })} />
                      </div>
                    </div>
                  </div>

                  {/* Barangay and address */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('barangay')} <span className="text-red-400">*</span></label>
                      <div className="relative group">
                        <div className="absolute left-3 top-2.5 w-5 h-5 rounded bg-orange-50 flex items-center justify-center group-focus-within:bg-orange-100 transition-colors">
                          <MapPin className="w-3.5 h-3.5 text-orange-500" />
                        </div>
                        <select className="input-field pl-11 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" value={regData.barangay}
                          onChange={e => setRegData({ ...regData, barangay: e.target.value })} required>
                          <option value="">Select Barangay</option>
                          {barangays.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('address')}</label>
                      <input type="text" className="input-field focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" placeholder="Street, Purok..." value={regData.address}
                        onChange={e => setRegData({ ...regData, address: e.target.value })} />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('password')} <span className="text-red-400">*</span></label>
                      <div className="relative group">
                        <div className="absolute left-3 top-2.5 w-5 h-5 rounded bg-primary-50 flex items-center justify-center group-focus-within:bg-primary-100 transition-colors">
                          <Lock className="w-3.5 h-3.5 text-primary-500" />
                        </div>
                        <input type="password" className="input-field pl-11 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" placeholder="min 6 chars" value={regData.password}
                          onChange={e => setRegData({ ...regData, password: e.target.value })} required minLength={6} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('confirmPassword')} <span className="text-red-400">*</span></label>
                      <div className="relative group">
                        <div className="absolute left-3 top-2.5 w-5 h-5 rounded bg-primary-50 flex items-center justify-center group-focus-within:bg-primary-100 transition-colors">
                          <Lock className="w-3.5 h-3.5 text-primary-500" />
                        </div>
                        <input type="password" className="input-field pl-11 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" placeholder="••••••" value={regData.confirmPassword}
                          onChange={e => setRegData({ ...regData, confirmPassword: e.target.value })} required />
                      </div>
                    </div>
                  </div>

                  {/* Valid ID Photo Upload + Camera Capture + Verification */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Valid ID Photo <span className="text-red-400">*</span></label>
                    <p className="text-xs text-gray-500 mb-2">Upload or capture a clear photo of any valid government-issued ID for AI-powered identity verification.</p>

                    {/* Camera view */}
                    {cameraOpen && (
                      <div className="relative mb-3 rounded-xl overflow-hidden bg-black">
                        <video ref={videoRef} autoPlay playsInline muted
                          className="w-full aspect-[4/3] object-cover"
                          style={{ WebkitTransform: 'translateZ(0)' }} />
                        <canvas ref={canvasRef} className="hidden" />
                        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-3 px-4">
                          <button type="button" onClick={capturePhoto}
                            className="px-5 py-3 bg-white text-gray-900 rounded-full text-sm font-semibold shadow-lg hover:bg-gray-100 transition-colors flex items-center gap-2 touch-target">
                            <Camera className="w-4 h-4" /> Capture
                          </button>
                          <button type="button" onClick={stopCamera}
                            className="px-5 py-3 bg-red-500 text-white rounded-full text-sm font-medium shadow-lg hover:bg-red-600 transition-colors touch-target">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ID preview or upload area */}
                    {!cameraOpen && (
                      <div className="relative">
                        {idPreview ? (
                          <div className={`relative border-2 rounded-xl overflow-hidden bg-gray-50 ${
                            idVerification?.isValid ? 'border-green-300' : idVerification && !idVerification.isValid ? 'border-red-300' : 'border-primary-200'
                          }`}>
                            <img src={idPreview} alt="ID Preview" className="w-full max-h-52 object-contain" />
                            <button type="button" onClick={() => { setIdPhoto(null); setIdPreview(null); setIdVerification(null); }}
                              className="absolute top-2 right-2 w-10 h-10 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg touch-target">
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2 sm:gap-3">
                            {/* Upload option */}
                            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl py-6 cursor-pointer hover:border-primary-400 hover:bg-primary-50/30 transition-colors active:bg-primary-50/50">
                              <Shield className="w-7 h-7 text-gray-400 mb-1.5" />
                              <span className="text-xs font-medium text-gray-600">Upload File</span>
                              <span className="text-[10px] text-gray-400 mt-0.5">JPG, PNG — max 5MB</span>
                              <input type="file" accept="image/jpeg,image/png,image/jpg,image/webp" className="hidden"
                                onChange={e => {
                                  const file = e.target.files[0];
                                  if (!file) return;
                                  if (file.size > 5 * 1024 * 1024) { toast.error('ID photo must be under 5MB'); return; }
                                  setIdPhoto(file);
                                  setIdPreview(URL.createObjectURL(file));
                                  setIdVerification(null);
                                }} />
                            </label>
                            {/* Camera option */}
                            <button type="button" onClick={startCamera}
                              className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl py-6 hover:border-primary-400 hover:bg-primary-50/30 transition-colors active:bg-primary-50/50">
                              <Camera className="w-7 h-7 text-gray-400 mb-1.5" />
                              <span className="text-xs font-medium text-gray-600">Use Camera</span>
                              <span className="text-[10px] text-gray-400 mt-0.5">Capture directly</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Verify ID button */}
                    {idPhoto && !idVerification?.isValid && (
                      <button type="button" onClick={verifyId} disabled={idVerifying}
                        className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-sm font-semibold hover:bg-amber-100 active:bg-amber-200 transition-colors disabled:opacity-60">
                        {idVerifying ? (
                          <>
                            <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                            Verifying ID with AI...
                          </>
                        ) : (
                          <>
                            <Shield className="w-4 h-4" />
                            Verify ID
                          </>
                        )}
                      </button>
                    )}

                    {/* Verification result */}
                    {idVerification && (
                      <div className={`mt-3 p-3 rounded-xl text-sm ${
                        idVerification.isValid
                          ? 'bg-green-50 border border-green-200'
                          : 'bg-red-50 border border-red-200'
                      }`}>
                        <div className="flex items-start gap-2">
                          {idVerification.isValid ? (
                            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                          ) : (
                            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                          )}
                          <div>
                            <p className={`font-semibold ${idVerification.isValid ? 'text-green-800' : 'text-red-800'}`}>
                              {idVerification.isValid ? 'ID Verified' : 'Verification Failed'}
                            </p>
                            {idVerification.idType && idVerification.idType !== 'unknown' && (
                              <p className="text-xs mt-0.5"><span className="font-medium">Type:</span> {idVerification.idType}</p>
                            )}
                            {idVerification.nameOnId && (
                              <p className="text-xs mt-0.5"><span className="font-medium">Name on ID:</span> {idVerification.nameOnId}</p>
                            )}
                            {idVerification.confidence > 0 && (
                              <p className="text-xs mt-0.5"><span className="font-medium">Confidence:</span> {idVerification.confidence}%</p>
                            )}
                            <p className="text-xs mt-1 opacity-80">{idVerification.reason}</p>
                            {idVerification.needsManualReview && (
                              <p className="text-xs mt-1 font-medium text-amber-700">Your ID will be reviewed manually by an admin.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Terms and Agreement checkbox */}
                  <label className="flex items-start gap-3 cursor-pointer group py-1">
                    <input type="checkbox" checked={agreedToTerms} onChange={e => setAgreedToTerms(e.target.checked)}
                      className="mt-0.5 w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 flex-shrink-0" />
                    <span className="text-xs text-gray-600 leading-relaxed">
                      I agree to the <button type="button" onClick={() => window.open('/terms', '_blank')} className="text-primary-600 font-semibold hover:underline">Terms and Conditions</button> and <button type="button" onClick={() => window.open('/terms', '_blank')} className="text-primary-600 font-semibold hover:underline">Privacy Policy</button> of the Aluguinsan E-Gov Portal. I confirm that the information and ID photo provided are accurate.
                    </span>
                  </label>

                  <button type="submit" disabled={loading || !agreedToTerms} className="btn-primary w-full py-3 text-sm font-semibold shadow-lg shadow-primary-600/25 hover:shadow-primary-600/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                    {loading ? t('loading') : t('createAccount')}
                  </button>
                  <p className="text-center text-sm text-gray-500">
                    {t('alreadyHaveAccount')}{' '}
                    <button type="button" onClick={() => setTab('login')} className="text-primary-600 font-semibold hover:underline">
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
    </div>
  );
}
