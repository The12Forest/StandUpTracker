import { useState, useEffect, useCallback } from 'react';
import { Settings, User, Lock, Shield, Key, Mail, Sparkles, Copy, Bell, Clock } from 'lucide-react';
import useAuthStore from '../stores/useAuthStore';
import useToastStore from '../stores/useToastStore';
import { api } from '../lib/api';
import { BentoCard } from '../components/BentoCard';
import { isPushSupported, subscribeToPush, unsubscribeFromPush, getPermissionState } from '../lib/pushNotifications';

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const changePassword = useAuthStore((s) => s.changePassword);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const toast = useToastStore();

  const [profile, setProfile] = useState({ dailyGoalMinutes: 30, geminiOptIn: false });
  const [pw, setPw] = useState({ current: '', new: '', confirm: '' });
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [email2faPassword, setEmail2faPassword] = useState('');
  const [showEmail2faPrompt, setShowEmail2faPrompt] = useState(false);
  const [totpSetup, setTotpSetup] = useState(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpDisablePassword, setTotpDisablePassword] = useState('');
  const [showTotpDisablePrompt, setShowTotpDisablePrompt] = useState(false);

  // Push notification state
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushError, setPushError] = useState('');
  const [pushPrefs, setPushPrefs] = useState({
    standup_reminder: true,
    streak_at_risk: true,
    friend_request: true,
    level_up: true,
    daily_goal_reached: true,
  });
  const [reminderTime, setReminderTime] = useState('12:00');

  useEffect(() => {
    if (user) {
      setProfile({
        dailyGoalMinutes: user.dailyGoalMinutes || 30,
        geminiOptIn: user.geminiOptIn || false,
      });
      setPushEnabled(user.pushEnabled || false);
      if (user.pushPreferences) {
        setPushPrefs(prev => ({ ...prev, ...user.pushPreferences }));
      }
      setReminderTime(user.standupReminderTime || '12:00');
    }
  }, [user]);

  const handleProfileSave = async () => {
    try {
      await updateProfile(profile);
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleEmailChange = async () => {
    if (!newEmail) return;
    if (!emailPassword) { toast.error('Current password required to change email'); return; }
    try {
      await api('/api/auth/email', { method: 'PUT', body: JSON.stringify({ newEmail, password: emailPassword }) });
      toast.success('Verification email sent to new address');
      setNewEmail('');
      setEmailPassword('');
      refreshUser();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handlePasswordChange = async () => {
    if (pw.new !== pw.confirm) { toast.error('Passwords do not match'); return; }
    if (pw.new.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    try {
      await changePassword(pw.current, pw.new);
      toast.success('Password changed');
      setPw({ current: '', new: '', confirm: '' });
    } catch (err) { toast.error(err.message); }
  };

  const setupTOTP = async () => {
    try { setTotpSetup(await api('/api/auth/2fa/totp/setup', { method: 'POST' })); }
    catch (err) { toast.error(err.message); }
  };
  const enableTOTP = async () => {
    try {
      await api('/api/auth/2fa/totp/enable', { method: 'POST', body: JSON.stringify({ code: totpCode }) });
      toast.success('TOTP 2FA enabled!'); setTotpSetup(null); setTotpCode(''); refreshUser();
    } catch (err) { toast.error(err.message); }
  };
  const disableTOTP = async () => {
    if (!showTotpDisablePrompt) { setShowTotpDisablePrompt(true); return; }
    if (!totpDisablePassword) { toast.error('Password required to disable TOTP'); return; }
    try {
      await api('/api/auth/2fa/totp/disable', { method: 'POST', body: JSON.stringify({ password: totpDisablePassword }) });
      toast.success('TOTP 2FA disabled');
      setShowTotpDisablePrompt(false);
      setTotpDisablePassword('');
      refreshUser();
    } catch (err) { toast.error(err.message); }
  };
  const handlePushToggle = useCallback(async () => {
    setPushLoading(true);
    setPushError('');
    if (!pushEnabled) {
      // Enable push
      const result = await subscribeToPush();
      if (result.success) {
        setPushEnabled(true);
        refreshUser();
        toast.success('Push notifications enabled');
      } else {
        setPushError(result.reason || 'Failed to enable push notifications');
      }
    } else {
      // Disable push
      const result = await unsubscribeFromPush();
      if (result.success) {
        setPushEnabled(false);
        refreshUser();
        toast.success('Push notifications disabled');
      } else {
        toast.error(result.reason || 'Failed to disable');
      }
    }
    setPushLoading(false);
  }, [pushEnabled, refreshUser, toast]);

  const savePushPrefs = useCallback(async (newPrefs, newTime) => {
    try {
      await api('/api/notifications/push/preferences', {
        method: 'PUT',
        body: JSON.stringify({
          pushPreferences: newPrefs,
          standupReminderTime: newTime,
        }),
      });
    } catch { /* silent save */ }
  }, []);

  const togglePushPref = useCallback((key) => {
    setPushPrefs(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      savePushPrefs(updated, reminderTime);
      return updated;
    });
  }, [savePushPrefs, reminderTime]);

  const handleReminderTimeChange = useCallback((value) => {
    setReminderTime(value);
    savePushPrefs(pushPrefs, value);
  }, [savePushPrefs, pushPrefs]);

  const toggleEmail2FA = async () => {
    if (!showEmail2faPrompt) { setShowEmail2faPrompt(true); return; }
    if (!email2faPassword) { toast.error('Password required'); return; }
    try {
      if (user?.email2faEnabled) {
        await api('/api/auth/2fa/email/disable', { method: 'POST', body: JSON.stringify({ password: email2faPassword }) });
        toast.success('Email 2FA disabled');
      } else {
        await api('/api/auth/2fa/email/enable', { method: 'POST', body: JSON.stringify({ password: email2faPassword }) });
        toast.success('Email 2FA enabled');
      }
      setShowEmail2faPrompt(false);
      setEmail2faPassword('');
      refreshUser();
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-zen-100 flex items-center gap-2">
        <Settings size={20} className="text-accent-400" />
        Settings
      </h2>

      {/* Account Info */}
      <BentoCard>
        <div className="flex items-center gap-2 mb-4">
          <User size={16} className="text-accent-400" />
          <span className="text-sm font-semibold text-zen-200">Account</span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs mb-4">
          <div>
            <span className="text-zen-500">UUID</span>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-zen-300 font-mono text-[10px] truncate">{user?.userId}</span>
              <button onClick={() => { navigator.clipboard.writeText(user?.userId || ''); toast.success('Copied'); }} className="text-zen-600 hover:text-zen-300"><Copy size={10} /></button>
            </div>
          </div>
          <div>
            <span className="text-zen-500">Role</span>
            <p className="text-zen-300 capitalize mt-0.5">{user?.role?.replace('_', ' ')}</p>
          </div>
          <div>
            <span className="text-zen-500">Joined</span>
            <p className="text-zen-300 mt-0.5">{user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</p>
          </div>
          <div>
            <span className="text-zen-500">Status</span>
            <p className="text-zen-300 mt-0.5">{user?.active !== false ? 'Active' : 'Inactive'}</p>
          </div>
        </div>
      </BentoCard>

      {/* Profile */}
      <BentoCard>
        <div className="flex items-center gap-2 mb-4">
          <Settings size={16} className="text-accent-400" />
          <span className="text-sm font-semibold text-zen-200">Profile</span>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-zen-500 mb-1 block">Username</label>
            <input value={user?.username || ''} disabled className="glass-input w-full opacity-60" />
          </div>
          <div>
            <label className="text-xs text-zen-500 mb-1 block">Email</label>
            <div className="flex items-center gap-2">
              <input value={user?.email || ''} disabled className="glass-input flex-1 opacity-60" />
              <span className={`text-xs px-2 py-1 rounded-lg ${user?.emailVerified ? 'bg-accent-500/10 text-accent-400' : 'bg-warn-500/10 text-warn-400'}`}>
                {user?.emailVerified ? 'Verified' : 'Unverified'}
              </span>
            </div>
            {user?.pendingEmail && (
              <p className="text-xs text-warn-400 mt-1">Pending change to: {user.pendingEmail} (check email to confirm)</p>
            )}
          </div>
          <div>
            <label className="text-xs text-zen-500 mb-1 block">Change Email</label>
            <div className="flex gap-2">
              <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="glass-input flex-1" placeholder="New email address" />
            </div>
            <input type="password" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} className="glass-input w-full mt-2" placeholder="Current password" autoComplete="current-password" />
            <button onClick={handleEmailChange} className="btn-ghost text-xs mt-2">Change Email</button>
          </div>
          <div>
            <label className="text-xs text-zen-500 mb-1 block">Daily Goal (minutes)</label>
            {user?.enforceDailyGoal ? (
              <div className="flex items-center gap-2">
                <input type="number" value={profile.dailyGoalMinutes} disabled className="glass-input w-32 opacity-60" />
                <Lock size={14} className="text-zen-500" />
                <span className="text-[10px] text-zen-500">Set by administrator</span>
              </div>
            ) : (
              <input type="number" min={1} max={480} value={profile.dailyGoalMinutes}
                onChange={(e) => setProfile({ ...profile, dailyGoalMinutes: parseInt(e.target.value) || 30 })}
                className="glass-input w-32" />
            )}
          </div>
          <div className="flex items-center justify-between py-2 border-t border-zen-700/30">
            <div>
              <p className="text-sm text-zen-200 flex items-center gap-2"><Sparkles size={14} /> AI Advisor</p>
              <p className="text-xs text-zen-500 mt-0.5">Opt in to receive AI-powered standing advice</p>
            </div>
            <button
              onClick={() => setProfile({ ...profile, geminiOptIn: !profile.geminiOptIn })}
              className={`w-10 h-5 rounded-full transition-colors relative ${profile.geminiOptIn ? 'bg-accent-500' : 'bg-zen-700'}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${profile.geminiOptIn ? 'left-5' : 'left-0.5'}`} />
            </button>
          </div>
          <button onClick={handleProfileSave} className="btn-accent text-sm">Save Profile</button>
        </div>
      </BentoCard>

      {/* Password */}
      <BentoCard>
        <div className="flex items-center gap-2 mb-4">
          <Lock size={16} className="text-accent-400" />
          <span className="text-sm font-semibold text-zen-200">Change Password</span>
        </div>
        <div className="space-y-3">
          <input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })}
            className="glass-input w-full" placeholder="Current password" autoComplete="current-password" />
          <input type="password" value={pw.new} onChange={(e) => setPw({ ...pw, new: e.target.value })}
            className="glass-input w-full" placeholder="New password (min 8 chars)" autoComplete="new-password" />
          <input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
            className="glass-input w-full" placeholder="Confirm new password" autoComplete="new-password" />
          <button onClick={handlePasswordChange} className="btn-accent text-sm">Change Password</button>
        </div>
      </BentoCard>

      {/* 2FA */}
      <BentoCard>
        <div className="flex items-center gap-2 mb-4">
          <Shield size={16} className="text-accent-400" />
          <span className="text-sm font-semibold text-zen-200">Two-Factor Authentication</span>
        </div>
        {user?.enforce2fa && (
          <div className="bg-accent-500/10 border border-accent-500/20 rounded-lg p-3 mb-4 flex items-center gap-2">
            <Lock size={14} className="text-accent-400 shrink-0" />
            <p className="text-xs text-accent-300">Two-factor authentication is required by your administrator. You must keep at least one 2FA method enabled.</p>
          </div>
        )}
        <div className="space-y-4">
          <div className="flex items-center justify-between py-2 border-b border-zen-700/30">
            <div>
              <p className="text-sm text-zen-200 flex items-center gap-2"><Key size={14} /> Authenticator App (TOTP)</p>
              <p className="text-xs text-zen-500 mt-0.5">Use Google Authenticator or similar</p>
            </div>
            {user?.totpEnabled ? (
              user?.enforce2fa && !user?.email2faEnabled ? (
                <span className="text-[10px] text-zen-500 flex items-center gap-1"><Lock size={10} /> Required</span>
              ) : (
                <button onClick={disableTOTP} className="btn-ghost text-xs text-danger-400">Disable</button>
              )
            ) : (
              <button onClick={setupTOTP} className="btn-ghost text-xs">Setup</button>
            )}
          </div>

          {showTotpDisablePrompt && (
            <div className="bg-zen-800/40 rounded-xl p-4 space-y-3">
              <p className="text-xs text-zen-400">Enter your password to disable TOTP:</p>
              <input
                type="password"
                value={totpDisablePassword}
                onChange={(e) => setTotpDisablePassword(e.target.value)}
                className="glass-input w-full text-sm"
                placeholder="Current password"
                autoComplete="current-password"
              />
              <div className="flex gap-2">
                <button onClick={disableTOTP} className="btn-accent text-sm">Confirm Disable</button>
                <button onClick={() => { setShowTotpDisablePrompt(false); setTotpDisablePassword(''); }} className="btn-ghost text-sm">Cancel</button>
              </div>
            </div>
          )}

          {totpSetup && (
            <div className="bg-zen-800/40 rounded-xl p-4 space-y-3">
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
              <button onClick={enableTOTP} className="btn-accent w-full text-sm">Verify & Enable</button>
            </div>
          )}

          {/* Email 2FA */}
          <div className="py-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zen-200 flex items-center gap-2"><Mail size={14} /> Email 2FA</p>
                <p className="text-xs text-zen-500 mt-0.5">Receive a code via email on login</p>
              </div>
              {user?.email2faEnabled ? (
                user?.enforce2fa && !user?.totpEnabled ? (
                  <span className="text-[10px] text-zen-500 flex items-center gap-1"><Lock size={10} /> Required</span>
                ) : (
                  <button
                    onClick={toggleEmail2FA}
                    className="btn-ghost text-xs text-danger-400"
                  >
                    Disable
                  </button>
                )
              ) : (
                <button
                  onClick={toggleEmail2FA}
                  className="btn-ghost text-xs"
                >
                  Enable
                </button>
              )}
            </div>
            {showEmail2faPrompt && (
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="password"
                  value={email2faPassword}
                  onChange={(e) => setEmail2faPassword(e.target.value)}
                  className="glass-input flex-1 text-sm"
                  placeholder="Enter your password to confirm"
                  autoComplete="current-password"
                />
                <button onClick={toggleEmail2FA} className="btn-accent text-xs">Confirm</button>
                <button onClick={() => { setShowEmail2faPrompt(false); setEmail2faPassword(''); }} className="btn-ghost text-xs">Cancel</button>
              </div>
            )}
          </div>
        </div>
      </BentoCard>

      {/* Notifications */}
      <BentoCard>
        <div className="flex items-center gap-2 mb-4">
          <Bell size={16} className="text-accent-400" />
          <span className="text-sm font-semibold text-zen-200">Notifications</span>
        </div>
        <div className="space-y-4">
          {/* Main push toggle */}
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm text-zen-200">Enable Browser Push Notifications</p>
              <p className="text-xs text-zen-500 mt-0.5">
                Receive OS-level notifications for reminders, streaks, and more
              </p>
            </div>
            {isPushSupported() ? (
              <button
                onClick={handlePushToggle}
                disabled={pushLoading}
                className={`w-10 h-5 rounded-full transition-colors relative ${pushEnabled ? 'bg-accent-500' : 'bg-zen-700'} ${pushLoading ? 'opacity-50' : ''}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${pushEnabled ? 'left-5' : 'left-0.5'}`} />
              </button>
            ) : (
              <span className="text-[10px] text-zen-500">Not supported in this browser</span>
            )}
          </div>

          {pushError && (
            <div className="bg-danger-500/10 border border-danger-500/20 rounded-lg p-3">
              <p className="text-xs text-danger-400">{pushError}</p>
            </div>
          )}

          {getPermissionState() === 'denied' && !pushEnabled && (
            <div className="bg-warn-500/10 border border-warn-500/20 rounded-lg p-3">
              <p className="text-xs text-warn-400">
                Notification permission is blocked. To enable push notifications, click the lock icon in your browser address bar and allow notifications for this site.
              </p>
            </div>
          )}

          {/* Per-type toggles — only shown when push is enabled */}
          {pushEnabled && (
            <div className="border-t border-zen-700/30 pt-3 space-y-3">
              <p className="text-xs text-zen-500 font-medium">Choose which notifications to receive:</p>

              {[
                { key: 'standup_reminder', label: 'Standup Reminder', desc: 'Daily reminder when no activity tracked' },
                { key: 'streak_at_risk', label: 'Streak at Risk', desc: 'Warning when your streak might break' },
                { key: 'friend_request', label: 'Friend Request', desc: 'When someone sends you a friend request' },
                { key: 'level_up', label: 'Level Up', desc: 'When you reach a new level' },
                { key: 'daily_goal_reached', label: 'Goal Reached', desc: 'When you hit your daily goal' },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-sm text-zen-300">{label}</p>
                    <p className="text-[10px] text-zen-600">{desc}</p>
                  </div>
                  <button
                    onClick={() => togglePushPref(key)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${pushPrefs[key] ? 'bg-accent-500' : 'bg-zen-700'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${pushPrefs[key] ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </div>
              ))}

              {/* Standup reminder time — only visible when standup_reminder is enabled */}
              {pushPrefs.standup_reminder && (
                <div className="flex items-center justify-between py-1 pl-4 border-l-2 border-accent-500/30">
                  <div>
                    <p className="text-sm text-zen-300 flex items-center gap-1"><Clock size={12} /> Reminder Time (UTC)</p>
                    <p className="text-[10px] text-zen-600">When to send the daily standup reminder</p>
                  </div>
                  <input
                    type="time"
                    value={reminderTime}
                    onChange={(e) => handleReminderTimeChange(e.target.value)}
                    className="glass-input w-28 text-sm text-center"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </BentoCard>
    </div>
  );
}
