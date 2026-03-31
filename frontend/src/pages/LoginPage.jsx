import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Timer, Eye, EyeOff, Mail, CheckCircle } from 'lucide-react';
import useAuthStore from '../stores/useAuthStore';
import useToastStore from '../stores/useToastStore';
import { api } from '../lib/api';

export default function LoginPage() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [code2fa, setCode2fa] = useState('');
  const [needs2FA, setNeeds2FA] = useState(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const justVerified = searchParams.get('verified') === 'true';
  const sessionExpired = searchParams.get('expired') === 'true';

  const authLogin = useAuthStore((s) => s.login);
  const toast = useToastStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await authLogin(login, password, code2fa || undefined, needs2FA || undefined);
      if (result.requires2fa) {
        setNeeds2FA(result.requires2fa);
        setCode2fa('');
        toast.info(`Enter your ${result.requires2fa === 'totp' ? 'authenticator' : 'email'} code`);
      } else if (result.needsVerification) {
        setNeedsVerification(true);
        setVerificationEmail(result.email || '');
        toast.warn('Please verify your email before logging in');
      } else {
        toast.success('Welcome back!');
        navigate('/app');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    const email = verificationEmail || login;
    if (!email) { toast.error('No email address available'); return; }
    setLoading(true);
    try {
      await api('/api/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) });
      toast.success('Verification email sent! Check your inbox.');
    } catch (err) { toast.error(err.message); }
    setLoading(false);
  };

  // Email verification required screen
  if (needsVerification) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-zen-950">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-accent-500/20 flex items-center justify-center">
              <Mail size={24} className="text-accent-400" />
            </div>
            <h1 className="text-2xl font-bold text-zen-100">Verify Email</h1>
          </div>
          <div className="bento-card text-center space-y-4">
            <Mail size={48} className="mx-auto text-accent-400" />
            <h2 className="text-lg font-semibold text-zen-100">Email Verification Required</h2>
            <p className="text-sm text-zen-400">
              Please check your inbox at <strong className="text-zen-200">{verificationEmail || login}</strong> and
              click the verification link to activate your account.
            </p>
            <button onClick={handleResendVerification} disabled={loading} className="btn-accent w-full">
              {loading ? 'Sending...' : 'Resend Verification Email'}
            </button>
            <button onClick={() => { setNeedsVerification(false); setNeeds2FA(null); setCode2fa(''); }} className="btn-ghost text-xs text-zen-500 w-full">
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-zen-950">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-accent-500/20 flex items-center justify-center">
            <Timer size={24} className="text-accent-400" />
          </div>
          <h1 className="text-2xl font-bold text-zen-100">StandUpTracker</h1>
        </div>

        {sessionExpired && (
          <div className="mb-4 p-3 rounded-xl bg-warn-500/10 border border-warn-500/30 text-sm text-warn-400 flex items-center gap-2">
            <Timer size={16} />
            Your session has expired. Please log in again.
          </div>
        )}

        {justVerified && (
          <div className="mb-4 p-3 rounded-xl bg-accent-500/10 border border-accent-500/30 text-sm text-accent-400 flex items-center gap-2">
            <CheckCircle size={16} />
            Email verified successfully! You can now log in.
          </div>
        )}

        <div className="bento-card">
          <h2 className="text-lg font-semibold text-zen-100 mb-6">Sign In</h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-xs text-zen-500 mb-1 block">Username or Email</label>
              <input
                type="text"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                className="glass-input w-full"
                placeholder="Enter username or email"
                required
                autoComplete="username"
              />
            </div>
            <div className="relative">
              <label className="text-xs text-zen-500 mb-1 block">Password</label>
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="glass-input w-full pr-10"
                placeholder="Enter password"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-8 text-zen-500 hover:text-zen-300"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {needs2FA && (
              <div>
                <label className="text-xs text-zen-500 mb-1 block">
                  {needs2FA === 'totp' ? 'Authenticator Code' : 'Email Code'}
                </label>
                <input
                  type="text"
                  value={code2fa}
                  onChange={(e) => setCode2fa(e.target.value)}
                  className="glass-input w-full text-center tracking-widest"
                  placeholder="000000"
                  maxLength={6}
                  autoFocus
                />
                {needs2FA === 'email' && (
                  <button
                    type="button"
                    onClick={async () => {
                      setLoading(true);
                      try {
                        await authLogin(login, password, undefined, undefined);
                        toast.info('Code re-sent to your email');
                      } catch { /* already handled */ }
                      setLoading(false);
                    }}
                    className="text-xs text-accent-400 hover:text-accent-300 mt-2"
                  >
                    Resend Code
                  </button>
                )}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-accent mt-2">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-sm text-zen-500 mt-6">
            No account?{' '}
            <Link to="/register" className="text-accent-400 hover:text-accent-300">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
