import { useState } from 'react';
import { Shield, Key, Mail } from 'lucide-react';
import useAuthStore from '../stores/useAuthStore';
import useToastStore from '../stores/useToastStore';
import { api } from '../lib/api';
import { BentoCard } from '../components/BentoCard';

export default function TwoFactorSetupPage() {
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const toast = useToastStore();

  const [method, setMethod] = useState(null); // 'totp' | 'email'
  const [totpSetup, setTotpSetup] = useState(null);
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);

  const setupTOTP = async () => {
    setLoading(true);
    try {
      const data = await api('/api/auth/2fa/totp/setup', { method: 'POST' });
      setTotpSetup(data);
      setMethod('totp');
    } catch (err) { toast.error(err.message); }
    setLoading(false);
  };

  const enableTOTP = async () => {
    setLoading(true);
    try {
      await api('/api/auth/2fa/totp/enable', { method: 'POST', body: JSON.stringify({ code: totpCode }) });
      toast.success('TOTP 2FA enabled!');
      await refreshUser();
    } catch (err) { toast.error(err.message); }
    setLoading(false);
  };

  const enableEmail2FA = async () => {
    setLoading(true);
    try {
      await api('/api/auth/2fa/email/enable', { method: 'POST' });
      toast.success('Email 2FA enabled!');
      await refreshUser();
    } catch (err) { toast.error(err.message); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-zen-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-accent-500/20 flex items-center justify-center mx-auto mb-4">
            <Shield size={28} className="text-accent-400" />
          </div>
          <h1 className="text-xl font-bold text-zen-100">Two-Factor Authentication Required</h1>
          <p className="text-sm text-zen-500 mt-2">
            Your administrator requires all users to enable two-factor authentication.
            Please choose a method below to continue.
          </p>
        </div>

        {!method && (
          <div className="space-y-3">
            <BentoCard className="cursor-pointer hover:border-accent-500/40 transition-colors" onClick={setupTOTP}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent-500/10 flex items-center justify-center shrink-0">
                  <Key size={18} className="text-accent-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zen-200">Authenticator App (TOTP)</p>
                  <p className="text-xs text-zen-500 mt-0.5">Use Google Authenticator, Authy, or similar</p>
                </div>
              </div>
            </BentoCard>

            <BentoCard className="cursor-pointer hover:border-accent-500/40 transition-colors" onClick={enableEmail2FA}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent-500/10 flex items-center justify-center shrink-0">
                  <Mail size={18} className="text-accent-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zen-200">Email 2FA</p>
                  <p className="text-xs text-zen-500 mt-0.5">Receive a verification code via email on each login</p>
                </div>
              </div>
            </BentoCard>
          </div>
        )}

        {method === 'totp' && totpSetup && (
          <BentoCard className="space-y-4">
            <p className="text-xs text-zen-400">Scan this QR code with your authenticator app:</p>
            <div className="flex justify-center">
              <img src={totpSetup.qrDataUrl} alt="TOTP QR" className="w-48 h-48 rounded-lg" />
            </div>
            <p className="text-[10px] text-zen-600 text-center break-all">Secret: {totpSetup.secret}</p>
            <input
              type="text"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              className="glass-input w-full text-center tracking-widest"
              placeholder="Enter 6-digit code"
              maxLength={6}
            />
            <button onClick={enableTOTP} disabled={loading} className="btn-accent w-full text-sm">
              {loading ? 'Verifying...' : 'Verify & Enable'}
            </button>
            <button onClick={() => { setMethod(null); setTotpSetup(null); setTotpCode(''); }} className="btn-ghost w-full text-xs">
              Back to method selection
            </button>
          </BentoCard>
        )}

        {loading && !method && (
          <p className="text-center text-zen-500 text-sm">Loading...</p>
        )}
      </div>
    </div>
  );
}
