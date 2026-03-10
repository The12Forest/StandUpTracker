import { useState } from 'react';
import { api, setToken } from '../lib/api';
import { Shield, Mail, Server, CheckCircle, ChevronRight, ChevronLeft, Loader2, Wifi } from 'lucide-react';

const STEPS = ['Admin Account', 'Email / SMTP', 'Application', 'Confirm'];

export default function SetupPage() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [smtpTestResult, setSmtpTestResult] = useState(null);
  const [smtpTesting, setSmtpTesting] = useState(false);

  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    smtpHost: '',
    smtpPort: '587',
    smtpSecure: false,
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
    appUrl: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
    appName: 'StandUpTracker',
    serverPort: '3000',
    sessionSecure: false,
  });

  const update = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError('');
  };

  const validateStep = () => {
    if (step === 0) {
      if (!form.username || !form.email || !form.password) return 'All fields are required';
      if (!/^[a-zA-Z0-9_]{3,30}$/.test(form.username)) return 'Username must be 3-30 chars, alphanumeric or underscore';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Invalid email format';
      if (form.password.length < 8) return 'Password must be at least 8 characters';
      if (form.password !== form.confirmPassword) return 'Passwords do not match';
    }
    return null;
  };

  const nextStep = () => {
    const err = validateStep();
    if (err) { setError(err); return; }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    setError('');
  };

  const prevStep = () => {
    setStep((s) => Math.max(s - 1, 0));
    setError('');
  };

  const testSmtp = async () => {
    setSmtpTesting(true);
    setSmtpTestResult(null);
    try {
      const data = await api('/api/setup/test-smtp', {
        method: 'POST',
        body: JSON.stringify({
          smtpHost: form.smtpHost,
          smtpPort: parseInt(form.smtpPort, 10),
          smtpSecure: form.smtpSecure,
          smtpUser: form.smtpUser,
          smtpPass: form.smtpPass,
        }),
      });
      setSmtpTestResult({ success: true, message: data.message });
    } catch (err) {
      setSmtpTestResult({ success: false, message: err.message });
    }
    setSmtpTesting(false);
  };

  const handleComplete = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api('/api/setup/complete', {
        method: 'POST',
        body: JSON.stringify({
          username: form.username,
          email: form.email,
          password: form.password,
          smtpHost: form.smtpHost || undefined,
          smtpPort: form.smtpPort ? parseInt(form.smtpPort, 10) : undefined,
          smtpSecure: form.smtpSecure,
          smtpUser: form.smtpUser || undefined,
          smtpPass: form.smtpPass || undefined,
          smtpFrom: form.smtpFrom || undefined,
          appUrl: form.appUrl,
          appName: form.appName,
          serverPort: form.serverPort ? parseInt(form.serverPort, 10) : undefined,
          sessionSecure: form.sessionSecure,
        }),
      });
      if (data.token) {
        setToken(data.token);
        localStorage.setItem('sut_user', JSON.stringify(data.user));
      }
      // Full reload to re-check setup status in App.jsx
      window.location.href = '/app';
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const inputClass = 'w-full bg-zen-900/80 border border-zen-700/50 rounded-xl px-4 py-3 text-zen-100 placeholder:text-zen-600 focus:outline-none focus:ring-2 focus:ring-accent-500/40 text-sm';

  return (
    <div className="min-h-screen bg-zen-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-zen-100">StandUpTracker Setup</h1>
          <p className="text-zen-500 text-sm mt-1">First-time configuration wizard</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all
                ${i < step ? 'bg-accent-500 text-white' : i === step ? 'bg-accent-500/20 text-accent-400 ring-2 ring-accent-500' : 'bg-zen-800 text-zen-600'}`}>
                {i < step ? <CheckCircle size={16} /> : i + 1}
              </div>
              {i < STEPS.length - 1 && <div className={`w-8 h-0.5 ${i < step ? 'bg-accent-500' : 'bg-zen-800'}`} />}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-zen-900/60 border border-zen-700/40 rounded-2xl p-6 space-y-5">
          <h2 className="text-lg font-semibold text-zen-200 flex items-center gap-2">
            {step === 0 && <><Shield size={18} className="text-accent-400" /> Create Admin Account</>}
            {step === 1 && <><Mail size={18} className="text-accent-400" /> Email / SMTP Configuration</>}
            {step === 2 && <><Server size={18} className="text-accent-400" /> Application Settings</>}
            {step === 3 && <><CheckCircle size={18} className="text-accent-400" /> Review & Complete</>}
          </h2>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {/* Step 0: Admin Account */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-zen-400 mb-1">Username</label>
                <input type="text" className={inputClass} placeholder="admin" value={form.username}
                  onChange={(e) => update('username', e.target.value)} autoComplete="username" />
              </div>
              <div>
                <label className="block text-xs text-zen-400 mb-1">Email</label>
                <input type="email" className={inputClass} placeholder="admin@example.com" value={form.email}
                  onChange={(e) => update('email', e.target.value)} autoComplete="email" />
              </div>
              <div>
                <label className="block text-xs text-zen-400 mb-1">Password</label>
                <input type="password" className={inputClass} placeholder="Minimum 8 characters" value={form.password}
                  onChange={(e) => update('password', e.target.value)} autoComplete="new-password" />
              </div>
              <div>
                <label className="block text-xs text-zen-400 mb-1">Confirm Password</label>
                <input type="password" className={inputClass} placeholder="Re-enter password" value={form.confirmPassword}
                  onChange={(e) => update('confirmPassword', e.target.value)} autoComplete="new-password" />
              </div>
            </div>
          )}

          {/* Step 1: SMTP */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-xs text-zen-500">Optional — configure later in Admin Settings if you prefer.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-zen-400 mb-1">SMTP Host</label>
                  <input type="text" className={inputClass} placeholder="smtp.example.com" value={form.smtpHost}
                    onChange={(e) => update('smtpHost', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs text-zen-400 mb-1">Port</label>
                  <input type="number" className={inputClass} placeholder="587" value={form.smtpPort}
                    onChange={(e) => update('smtpPort', e.target.value)} />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm text-zen-300 cursor-pointer">
                    <input type="checkbox" checked={form.smtpSecure} onChange={(e) => update('smtpSecure', e.target.checked)}
                      className="accent-accent-500" />
                    Use TLS/SSL
                  </label>
                </div>
                <div>
                  <label className="block text-xs text-zen-400 mb-1">SMTP Username</label>
                  <input type="text" className={inputClass} placeholder="noreply@example.com" value={form.smtpUser}
                    onChange={(e) => update('smtpUser', e.target.value)} autoComplete="off" />
                </div>
                <div>
                  <label className="block text-xs text-zen-400 mb-1">SMTP Password</label>
                  <input type="password" className={inputClass} placeholder="•••••••" value={form.smtpPass}
                    onChange={(e) => update('smtpPass', e.target.value)} autoComplete="off" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-zen-400 mb-1">From Address</label>
                  <input type="text" className={inputClass} placeholder="StandUpTracker <noreply@example.com>" value={form.smtpFrom}
                    onChange={(e) => update('smtpFrom', e.target.value)} />
                </div>
              </div>
              {form.smtpHost && (
                <button onClick={testSmtp} disabled={smtpTesting}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm bg-zen-800 text-zen-300 hover:bg-zen-700 transition-colors disabled:opacity-50">
                  {smtpTesting ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
                  {smtpTesting ? 'Testing...' : 'Test SMTP Connection'}
                </button>
              )}
              {smtpTestResult && (
                <div className={`text-sm rounded-xl px-4 py-3 ${smtpTestResult.success ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
                  {smtpTestResult.message}
                </div>
              )}
            </div>
          )}

          {/* Step 2: App Settings */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-zen-400 mb-1">Application Name</label>
                <input type="text" className={inputClass} value={form.appName}
                  onChange={(e) => update('appName', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-zen-400 mb-1">Application URL</label>
                <input type="text" className={inputClass} placeholder="https://myapp.example.com" value={form.appUrl}
                  onChange={(e) => update('appUrl', e.target.value)} />
                <p className="text-[10px] text-zen-600 mt-1">Used in email links. Include protocol, no trailing slash.</p>
              </div>
              <div>
                <label className="block text-xs text-zen-400 mb-1">Server Port</label>
                <input type="number" className={inputClass} value={form.serverPort}
                  onChange={(e) => update('serverPort', e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm text-zen-300 cursor-pointer">
                <input type="checkbox" checked={form.sessionSecure} onChange={(e) => update('sessionSecure', e.target.checked)}
                  className="accent-accent-500" />
                Secure cookies (enable if using HTTPS)
              </label>
            </div>
          )}

          {/* Step 3: Summary */}
          {step === 3 && (
            <div className="space-y-4 text-sm">
              <div className="bg-zen-800/50 rounded-xl p-4 space-y-2">
                <h3 className="text-zen-300 font-semibold text-xs uppercase tracking-wider">Admin Account</h3>
                <div className="text-zen-400">Username: <span className="text-zen-200">{form.username}</span></div>
                <div className="text-zen-400">Email: <span className="text-zen-200">{form.email}</span></div>
              </div>
              <div className="bg-zen-800/50 rounded-xl p-4 space-y-2">
                <h3 className="text-zen-300 font-semibold text-xs uppercase tracking-wider">SMTP</h3>
                {form.smtpHost ? (
                  <>
                    <div className="text-zen-400">Host: <span className="text-zen-200">{form.smtpHost}:{form.smtpPort}</span></div>
                    <div className="text-zen-400">User: <span className="text-zen-200">{form.smtpUser || '(none)'}</span></div>
                  </>
                ) : (
                  <div className="text-zen-500 italic">Not configured — can be set later in Admin Settings</div>
                )}
              </div>
              <div className="bg-zen-800/50 rounded-xl p-4 space-y-2">
                <h3 className="text-zen-300 font-semibold text-xs uppercase tracking-wider">Application</h3>
                <div className="text-zen-400">Name: <span className="text-zen-200">{form.appName}</span></div>
                <div className="text-zen-400">URL: <span className="text-zen-200">{form.appUrl}</span></div>
                <div className="text-zen-400">Port: <span className="text-zen-200">{form.serverPort}</span></div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-2">
            <button onClick={prevStep} disabled={step === 0}
              className="flex items-center gap-1 px-4 py-2 rounded-xl text-sm text-zen-400 hover:text-zen-200 disabled:opacity-30 transition-colors">
              <ChevronLeft size={16} /> Back
            </button>
            {step < STEPS.length - 1 ? (
              <button onClick={nextStep}
                className="flex items-center gap-1 px-5 py-2 rounded-xl text-sm bg-accent-500 text-white hover:bg-accent-600 transition-colors font-medium">
                Next <ChevronRight size={16} />
              </button>
            ) : (
              <button onClick={handleComplete} disabled={loading}
                className="flex items-center gap-1 px-5 py-2 rounded-xl text-sm bg-accent-500 text-white hover:bg-accent-600 transition-colors font-medium disabled:opacity-50">
                {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                {loading ? 'Setting up...' : 'Complete Setup'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
