import React, { useState, useEffect, useRef } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import {
  Receipt,
  Shield,
  Lock,
  Mail,
  User as UserIcon,
  ArrowRight,
  Sparkles,
  Building2,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Eye,
  EyeOff,
  Check,
  X,
  Users,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Edit3,
  Send,
  Inbox,
  Clock,
} from 'lucide-react';

interface AuthScreenProps {
  onSuccess?: () => void;
  onDemoSignIn?: (email: string, name: string) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onDemoSignIn }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Email Confirmation Code State
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState<string[]>(['', '', '', '', '', '']);
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const [codeSentTime, setCodeSentTime] = useState<Date | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [codeSuccessMessage, setCodeSuccessMessage] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [showDemoAccounts, setShowDemoAccounts] = useState(false);

  // Countdown timer for Resend Code
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Validation helpers
  const cleanEmail = email.trim().toLowerCase();
  const cleanConfirmEmail = confirmEmail.trim().toLowerCase();

  const emailsMatch = isSignUp
    ? cleanEmail.length > 0 && cleanConfirmEmail.length > 0 && cleanEmail === cleanConfirmEmail
    : true;
  const emailsMismatch = isSignUp && cleanConfirmEmail.length > 0 && cleanEmail !== cleanConfirmEmail;

  const passwordsMatch = isSignUp
    ? password.length > 0 && confirmPassword.length > 0 && password === confirmPassword
    : true;
  const passwordsMismatch = isSignUp && confirmPassword.length > 0 && password !== confirmPassword;

  const passwordIsStrong = password.length >= 6;

  // Generate a random 6-digit confirmation code
  const sendVerificationCode = () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedCode(code);
    setCodeSentTime(new Date());
    setResendCooldown(30);
    setConfirmationCode(['', '', '', '', '', '']);
    setCodeError(null);
    setCodeSuccessMessage(`Verification code sent to ${cleanEmail}`);
    setIsVerifyingCode(true);

    // Focus on first OTP input
    setTimeout(() => {
      if (otpInputRefs.current[0]) {
        otpInputRefs.current[0].focus();
      }
    }, 100);
  };

  const handleOtpChange = (index: number, value: string) => {
    // Only accept numeric inputs
    const sanitized = value.replace(/\D/g, '');
    if (!sanitized && value !== '') return;

    const newCode = [...confirmationCode];

    if (sanitized.length > 1) {
      // Handle paste
      const pastedDigits = sanitized.slice(0, 6).split('');
      pastedDigits.forEach((digit, i) => {
        if (i < 6) newCode[i] = digit;
      });
      setConfirmationCode(newCode);
      const nextIndex = Math.min(pastedDigits.length, 5);
      otpInputRefs.current[nextIndex]?.focus();
      return;
    }

    newCode[index] = sanitized;
    setConfirmationCode(newCode);

    // Auto advance focus
    if (sanitized && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !confirmationCode[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) {
      setError('Please enter your email to receive a password reset link.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await sendPasswordResetEmail(auth, resetEmail.trim());
      setResetMessage(`Password reset link sent to ${resetEmail.trim()}. Please check your email inbox.`);
      setShowForgotPassword(false);
    } catch (err: any) {
      console.error('Password reset error:', err);
      let msg = err.message || 'Could not send password reset email.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-email') {
        msg = 'No registered user found with that email address.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Step 1: Submit Initial Form
  const handleInitiateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResetMessage(null);

    // If Sign In, proceed directly
    if (!isSignUp) {
      if (!cleanEmail) {
        setError('Please enter your registered email address.');
        return;
      }
      if (!password) {
        setError('Please enter your password.');
        return;
      }

      setLoading(true);
      try {
        const credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
        if (!credential.user.emailVerified) {
          await sendEmailVerification(credential.user);
          await signOut(auth);
          setError('Please verify your email address before signing in. A new verification link has been sent.');
          return;
        }
      } catch (err: any) {
        console.warn('Firebase Auth sign in notice:', err);
        let friendlyMsg = err.message || 'Authentication failed. Please verify your details.';
        if (
          err.code === 'auth/invalid-credential' ||
          err.code === 'auth/wrong-password' ||
          err.code === 'auth/user-not-found'
        ) {
          friendlyMsg = 'Invalid email or password. Please verify your credentials or use Forgot Password.';
        }
        setError(friendlyMsg);
      } finally {
        setLoading(false);
      }
      return;
    }

    // If Sign Up: Validate fields then trigger code generation and verification step
    if (!fullName.trim()) {
      setError('Please enter your full name & title.');
      return;
    }
    if (!cleanEmail) {
      setError('Please enter your email address.');
      return;
    }
    if (cleanEmail !== cleanConfirmEmail) {
      setError('Email address and Confirmation Email do not match. Please verify.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters in length.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Password and Confirmation Password do not match. Please verify.');
      return;
    }

    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      await updateProfile(userCredential.user, { displayName: fullName.trim() });
      await sendEmailVerification(userCredential.user);
      await signOut(auth);
      setResetMessage(`A secure verification link was sent to ${cleanEmail}. Verify the address, then sign in.`);
      setIsSignUp(false);
      setPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('An account with this email address already exists. Please sign in instead.');
      } else {
        setError(err.message || 'Registration failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify Code and Finalize Account Registration
  const handleVerifyCodeAndRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeError(null);

    const enteredCode = confirmationCode.join('');
    if (enteredCode.length < 6) {
      setCodeError('Please enter the full 6-digit confirmation code.');
      return;
    }

    if (enteredCode !== generatedCode) {
      setCodeError('Incorrect confirmation code. Please check your inbox or request a new code.');
      return;
    }

    setLoading(true);

    try {
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        if (userCredential.user) {
          await updateProfile(userCredential.user, {
            displayName: fullName.trim(),
          });
        }
      } catch (firebaseErr: any) {
        console.warn('Firebase Auth creation notice:', firebaseErr);
        throw firebaseErr;
      }
    } catch (err: any) {
      console.error('Registration error:', err);
      let friendlyMsg = err.message || 'Registration failed.';
      if (err.code === 'auth/email-already-in-use') {
        friendlyMsg = 'An account with this email address already exists. Please sign in instead.';
      } else if (err.code === 'auth/weak-password') {
        friendlyMsg = 'Password is too weak. Please use at least 6 characters.';
      }
      setCodeError(friendlyMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error('Google Auth error:', err);
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(err.message || 'Failed to sign in with Google.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoLogin = (demoEmail: string, demoName: string) => {
    setError(null);
    if (onDemoSignIn) {
      onDemoSignIn(demoEmail, demoName);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center items-center px-4 py-10 selection:bg-emerald-500 selection:text-white">
      {/* Background visual accents */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-teal-600/10 rounded-full blur-3xl"></div>
      </div>

      <div className="max-w-md w-full relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-600 shadow-xl shadow-emerald-950/50 mb-3 border border-emerald-500/30">
            <Receipt className="w-8 h-8 text-emerald-100" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Dues Book
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-medium">
            Authoritative Financial Record Book for Groups & Associations
          </p>
          <div className="mt-2 inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-700/50 text-[11px] text-emerald-300 font-medium">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>Secure Cloud Verification & Ledger Active</span>
          </div>
        </div>

        {/* Auth Card */}
        <div className="bg-slate-800/90 backdrop-blur-md rounded-2xl border border-slate-700/80 p-6 sm:p-8 shadow-2xl">
          {/* Email Confirmation Code Verification View */}
          {isVerifyingCode ? (
            <div className="space-y-5 animate-in zoom-in-95 duration-200">
              <div className="text-center space-y-1.5">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-950 border border-emerald-600/50 text-emerald-400 mb-1">
                  <Mail className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-bold text-white">Confirm Your Email Address</h2>
                <p className="text-xs text-slate-300">
                  We sent a 6-digit confirmation code to:
                </p>
                <div className="inline-flex items-center space-x-1.5 font-mono text-xs font-bold text-emerald-400 bg-slate-900 px-3 py-1 rounded-lg border border-slate-700">
                  <span>{cleanEmail}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsVerifyingCode(false);
                      setCodeError(null);
                    }}
                    className="text-slate-400 hover:text-white ml-1 cursor-pointer"
                    title="Edit Email Address"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Delivery Preview Notification */}
              <div className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-700/80 text-emerald-100 text-xs space-y-1.5">
                <div className="flex items-center space-x-1.5 font-bold text-emerald-300">
                  <Inbox className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Email Code Delivery Simulated</span>
                </div>
                <div className="flex items-center justify-between bg-slate-900/90 p-2 rounded-lg border border-emerald-800/60 font-mono">
                  <span className="text-slate-400 text-[11px]">Security Code:</span>
                  <span className="text-base font-black text-emerald-400 tracking-widest bg-emerald-950 px-2.5 py-0.5 rounded border border-emerald-700">
                    {generatedCode}
                  </span>
                </div>
                <p className="text-[10px] text-emerald-300/80">
                  Enter the 6-digit verification code above to verify ownership and complete onboarding.
                </p>
              </div>

              {codeError && (
                <div className="p-3 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-200 text-xs flex items-start space-x-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{codeError}</span>
                </div>
              )}

              {/* 6-Digit OTP Inputs */}
              <form onSubmit={handleVerifyCodeAndRegister} className="space-y-4">
                <div>
                  <label className="block text-center text-xs font-semibold text-slate-300 mb-2">
                    Enter 6-Digit Verification Code
                  </label>
                  <div className="flex items-center justify-center space-x-2 sm:space-x-2.5">
                    {confirmationCode.map((digit, index) => (
                      <input
                        key={index}
                        ref={(el) => (otpInputRefs.current[index] = el)}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(index, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(index, e)}
                        className={`w-11 h-12 text-center text-lg font-mono font-bold bg-slate-900 border rounded-xl text-white focus:ring-2 outline-none transition ${
                          digit
                            ? 'border-emerald-500 ring-1 ring-emerald-500 bg-emerald-950/30'
                            : 'border-slate-700 focus:border-emerald-500 focus:ring-emerald-500'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || confirmationCode.some((d) => !d)}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition flex items-center justify-center space-x-2 shadow-lg shadow-emerald-950/40 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <span>Verifying & Setting Up...</span>
                  ) : (
                    <>
                      <span>Verify Email & Complete Onboarding</span>
                      <CheckCircle2 className="w-4 h-4" />
                    </>
                  )}
                </button>

                {/* Resend Code & Back actions */}
                <div className="flex items-center justify-between text-xs pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsVerifyingCode(false);
                      setCodeError(null);
                    }}
                    className="text-slate-400 hover:text-slate-200 flex items-center space-x-1 cursor-pointer"
                  >
                    <span>← Edit Details</span>
                  </button>

                  <button
                    type="button"
                    disabled={resendCooldown > 0}
                    onClick={sendVerificationCode}
                    className="text-emerald-400 hover:text-emerald-300 disabled:text-slate-500 flex items-center space-x-1 font-medium cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${resendCooldown > 0 ? '' : 'hover:rotate-180 transition'}`} />
                    <span>
                      {resendCooldown > 0 ? `Resend Code in ${resendCooldown}s` : 'Resend Code'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <>
              {/* Tab Switcher: Sign In vs Create Account */}
              <div className="flex rounded-xl bg-slate-900/80 p-1 border border-slate-700 mb-5">
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(false);
                    setError(null);
                    setResetMessage(null);
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                    !isSignUp
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(true);
                    setError(null);
                    setResetMessage(null);
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                    isSignUp
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Create Account (New User)
                </button>
              </div>

              {/* Success / Info Notification */}
              {resetMessage && (
                <div className="mb-4 p-3 rounded-lg bg-emerald-950/60 border border-emerald-700 text-emerald-200 text-xs flex items-start space-x-2 animate-in fade-in duration-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{resetMessage}</span>
                </div>
              )}

              {/* Error Notification */}
              {error && (
                <div className="mb-4 p-3 rounded-lg bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-start space-x-2 animate-in fade-in duration-200">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="flex-1 leading-relaxed">
                    <span>{error}</span>
                  </div>
                </div>
              )}

              <form onSubmit={handleInitiateSubmit} className="space-y-4">
                {/* Full Name for Sign Up */}
                {isSignUp && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Full Name & Title <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="text"
                        required={isSignUp}
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g., Engr. Peter Orazulike"
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-900/90 border border-slate-700 rounded-lg text-xs text-white placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Email Address */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Email Address <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g., peter.orazulike@gmail.com"
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-900/90 border border-slate-700 rounded-lg text-xs text-white placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                  </div>
                </div>

                {/* Confirm Email Address (Sign Up Only) */}
                {isSignUp && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-300">
                        Confirm Email Address <span className="text-rose-400">*</span>
                      </label>
                      {confirmEmail.trim().length > 0 && (
                        <span
                          className={`text-[10px] font-medium flex items-center space-x-1 ${
                            emailsMatch ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {emailsMatch ? (
                            <>
                              <Check className="w-3 h-3" />
                              <span>Emails match</span>
                            </>
                          ) : (
                            <>
                              <X className="w-3 h-3" />
                              <span>Emails do not match</span>
                            </>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="email"
                        required={isSignUp}
                        value={confirmEmail}
                        onChange={(e) => setConfirmEmail(e.target.value)}
                        placeholder="Re-enter your email address"
                        className={`w-full pl-9 pr-3 py-2.5 bg-slate-900/90 border rounded-lg text-xs text-white placeholder:text-slate-500 focus:ring-2 outline-none ${
                          emailsMismatch
                            ? 'border-rose-500 focus:ring-rose-500'
                            : emailsMatch && confirmEmail.length > 0
                            ? 'border-emerald-500 focus:ring-emerald-500'
                            : 'border-slate-700 focus:ring-emerald-500'
                        }`}
                      />
                    </div>
                  </div>
                )}

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-300">
                      Password <span className="text-rose-400">*</span>
                    </label>
                    {!isSignUp && (
                      <button
                        type="button"
                        onClick={() => {
                          setResetEmail(email);
                          setShowForgotPassword(true);
                          setError(null);
                        }}
                        className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium cursor-pointer"
                      >
                        Forgot Password?
                      </button>
                    )}
                    {isSignUp && password.length > 0 && (
                      <span
                        className={`text-[10px] ${
                          passwordIsStrong ? 'text-emerald-400 font-medium' : 'text-amber-400'
                        }`}
                      >
                        {passwordIsStrong ? '✓ Minimum 6 chars met' : `${password.length}/6 characters`}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-10 py-2.5 bg-slate-900/90 border border-slate-700 rounded-lg text-xs text-white placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-white cursor-pointer"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password (Sign Up Only) */}
                {isSignUp && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-300">
                        Confirm Password <span className="text-rose-400">*</span>
                      </label>
                      {confirmPassword.length > 0 && (
                        <span
                          className={`text-[10px] font-medium flex items-center space-x-1 ${
                            passwordsMatch ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {passwordsMatch ? (
                            <>
                              <Check className="w-3 h-3" />
                              <span>Passwords match</span>
                            </>
                          ) : (
                            <>
                              <X className="w-3 h-3" />
                              <span>Passwords do not match</span>
                            </>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        required={isSignUp}
                        minLength={6}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter your password"
                        className={`w-full pl-9 pr-10 py-2.5 bg-slate-900/90 border rounded-lg text-xs text-white placeholder:text-slate-500 focus:ring-2 outline-none ${
                          passwordsMismatch
                            ? 'border-rose-500 focus:ring-rose-500'
                            : passwordsMatch && confirmPassword.length > 0
                            ? 'border-emerald-500 focus:ring-emerald-500'
                            : 'border-slate-700 focus:ring-emerald-500'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-white cursor-pointer"
                        title={showConfirmPassword ? 'Hide password' : 'Show password'}
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 flex items-center space-x-1">
                      <Shield className="w-3 h-3 text-emerald-400" />
                      <span>A 6-digit confirmation code will be sent to your email to verify before onboarding.</span>
                    </p>
                  </div>
                )}

                {/* Submit Action Button */}
                <button
                  type="submit"
                  disabled={loading || (isSignUp && (emailsMismatch || passwordsMismatch))}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition flex items-center justify-center space-x-2 shadow-lg shadow-emerald-950/40 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <span>Processing...</span>
                  ) : isSignUp ? (
                    <>
                      <span>Send Confirmation Code & Continue</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      <span>Sign In to Dues Book</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-700"></div>
                </div>
                <div className="relative flex justify-center text-[11px] uppercase tracking-wider text-slate-400">
                  <span className="bg-slate-800 px-2 font-medium">Or continue with</span>
                </div>
              </div>

              {/* Google Sign In */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full py-2.5 px-4 bg-slate-900/80 hover:bg-slate-900 text-slate-200 border border-slate-700 font-semibold text-xs rounded-lg transition flex items-center justify-center space-x-2.5 cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Sign In with Google</span>
              </button>

              {/* Quick Demo Access Accordion for Immediate Testing */}
              <div className="mt-4 pt-3 border-t border-slate-700/60">
                <button
                  type="button"
                  onClick={() => setShowDemoAccounts(!showDemoAccounts)}
                  className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 cursor-pointer py-1"
                >
                  <span className="flex items-center space-x-1.5 font-medium">
                    <Users className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Quick Demo Accounts (Instant Test)</span>
                  </span>
                  {showDemoAccounts ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {showDemoAccounts && (
                  <div className="mt-2.5 space-y-1.5 animate-in slide-in-from-top-2 duration-150">
                    <button
                      type="button"
                      onClick={() => handleQuickDemoLogin('peter.orazulike@gmail.com', 'Engr. Peter Orazulike')}
                      className="w-full text-left p-2 rounded-lg bg-slate-900/60 hover:bg-slate-900 border border-slate-700/60 text-[11px] text-slate-300 flex items-center justify-between transition cursor-pointer"
                    >
                      <div>
                        <div className="font-bold text-white">Engr. Peter Orazulike</div>
                        <div className="text-[10px] text-emerald-400">Executive Administrator</div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickDemoLogin('ngozi.eze@gmail.com', 'Mrs. Ngozi Eze')}
                      className="w-full text-left p-2 rounded-lg bg-slate-900/60 hover:bg-slate-900 border border-slate-700/60 text-[11px] text-slate-300 flex items-center justify-between transition cursor-pointer"
                    >
                      <div>
                        <div className="font-bold text-white">Mrs. Ngozi Eze</div>
                        <div className="text-[10px] text-emerald-400">Financial Secretary</div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickDemoLogin('emeka.okonkwo@gmail.com', 'Chief Emeka Okonkwo')}
                      className="w-full text-left p-2 rounded-lg bg-slate-900/60 hover:bg-slate-900 border border-slate-700/60 text-[11px] text-slate-300 flex items-center justify-between transition cursor-pointer"
                    >
                      <div>
                        <div className="font-bold text-white">Chief Emeka Okonkwo</div>
                        <div className="text-[10px] text-emerald-400">Treasurer</div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Feature summary pills */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-[11px] text-slate-400">
          <div className="flex items-center space-x-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Traceable Receipts</span>
          </div>
          <div className="flex items-center space-x-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>WhatsApp Share (wa.me)</span>
          </div>
          <div className="flex items-center space-x-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Multi-Role Governance</span>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-2xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-2 text-emerald-400">
              <KeyRound className="w-5 h-5" />
              <h3 className="font-bold text-sm text-white">Reset Account Password</h3>
            </div>
            <p className="text-xs text-slate-300">
              Enter your registered email address. We will send you an official password reset link.
            </p>
            <form onSubmit={handleResetPassword} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="e.g., peter.orazulike@gmail.com"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
