import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Timer, Eye, EyeOff, Mail } from 'lucide-react';
import useAuthStore from '../stores/useAuthStore';
import useToastStore from '../stores/useToastStore';
import { scavengeLegacyData } from '../lib/migration';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  const register = useAuthStore((s) => s.register);
  const toast = useToastStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      const legacy = scavengeLegacyData();
      const result = await register(username, email, password, legacy);
      if (result.needsVerification) {
        setRegistered(true);
        toast.success('Account created! Check your email to verify.');
      } else {
        toast.success('Account created!');
        navigate('/app');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (registered) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-zen-950">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-accent-500/20 flex items-center justify-center">
              <Mail size={24} className="text-accent-400" />
            </div>
            <h1 className="text-2xl font-bold text-zen-100">Check Your Email</h1>
          </div>
          <div className="bento-card text-center space-y-4">
            <Mail size={48} className="mx-auto text-accent-400" />
            <h2 className="text-lg font-semibold text-zen-100">Registration Successful!</h2>
            <p className="text-sm text-zen-400">
              We've sent a verification email to <strong className="text-zen-200">{email}</strong>.
              Click the button in the email to activate your account.
            </p>
            <Link to="/login" className="btn-accent inline-block w-full text-center">
              Go to Login
            </Link>
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

        <div className="bento-card">
          <h2 className="text-lg font-semibold text-zen-100 mb-6">Create Account</h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-xs text-zen-500 mb-1 block">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="glass-input w-full"
                placeholder="Choose a username"
                required
                autoComplete="username"
                minLength={2}
                maxLength={30}
              />
            </div>
            <div>
              <label className="text-xs text-zen-500 mb-1 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="glass-input w-full"
                placeholder="your@email.com"
                required
                autoComplete="email"
              />
            </div>
            <div className="relative">
              <label className="text-xs text-zen-500 mb-1 block">Password</label>
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="glass-input w-full pr-10"
                placeholder="At least 8 characters"
                required
                minLength={8}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-8 text-zen-500 hover:text-zen-300"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <button type="submit" disabled={loading} className="btn-accent mt-2">
              {loading ? 'Creating...' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-zen-500 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-accent-400 hover:text-accent-300">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
