import { useState, useEffect, useCallback } from 'react';
import { Settings, User, Lock, Shield, Key, Mail, Sparkles, Copy, Bell, Clock, Plus, Trash2, RefreshCw, Webhook } from 'lucide-react';
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
    report_warning: true,
    report_cleared: true,
    admin_report_alert: true,
  });
  const [reminderTime, setReminderTime] = useState('12:00');
  const [quietFrom, setQuietFrom] = useState('22:00');
  const [quietUntil, setQuietUntil] = useState('07:00');
  const [maxNotifsPerDay, setMaxNotifsPerDay] = useState(3);
  const [goalError, setGoalError] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameSaving, setUsernameSaving] = useState(false);

  // API Key state
  const [apiKeys, setApiKeys] = useState([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState(null); // shown once after creation
  const [apiKeyLoading, setApiKeyLoading] = useState(false);

  // Webhook state
  const [webhooks, setWebhooks] = useState([]);
  const [newWebhook, setNewWebhook] = useState({ name: '', url: '', events: [] });
  const [createdWebhookSecret, setCreatedWebhookSecret] = useState(null);
  const [webhookLoading, setWebhookLoading] = useState(false);

  const WEBHOOK_EVENTS = [
    { value: 'timer.started', label: 'Timer Started' },
    { value: 'timer.stopped', label: 'Timer Stopped' },
    { value: 'goal.reached', label: 'Goal Reached' },
    { value: 'streak.incremented', label: 'Streak Incremented' },
    { value: 'streak.broken', label: 'Streak Broken' },
    { value: 'friend_request.received', label: 'Friend Request Received' },
  ];

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
      setQuietFrom(user.quietHoursFrom || '22:00');
      setQuietUntil(user.quietHoursUntil || '07:00');
      setMaxNotifsPerDay(user.maxNotificationsPerDay ?? 3);
    }
  }, [user]);

  // Load API keys and webhooks on mount
  useEffect(() => {
    api('/api/auth/api-keys').then(d => setApiKeys(d.keys || [])).catch(() => {});
    api('/api/auth/webhooks').then(d => setWebhooks(d.webhooks || [])).catch(() => {});
  }, []);

  const createApiKey = async () => {
    if (!newKeyName.trim()) { toast.error('Key name is required'); return; }
    setApiKeyLoading(true);
    try {
      const data = await api('/api/auth/api-keys', { method: 'POST', body: JSON.stringify({ name: newKeyName }) });
      setCreatedKey(data);
      setNewKeyName('');
      const updated = await api('/api/auth/api-keys');
      setApiKeys(updated.keys || []);
    } catch (err) { toast.error(err.message); }
    setApiKeyLoading(false);
  };

  const revokeApiKey = async (keyId) => {
    if (!window.confirm('Revoke this API key? Any integrations using it will stop working.')) return;
    try {
      await api(`/api/auth/api-keys/${keyId}`, { method: 'DELETE' });
      setApiKeys(prev => prev.filter(k => k.keyId !== keyId));
      toast.success('API key revoked');
    } catch (err) { toast.error(err.message); }
  };

  const createWebhook = async () => {
    if (!newWebhook.name.trim() || !newWebhook.url.trim()) { toast.error('Name and URL are required'); return; }
    if (newWebhook.events.length === 0) { toast.error('Select at least one event'); return; }
    setWebhookLoading(true);
    try {
      const data = await api('/api/auth/webhooks', { method: 'POST', body: JSON.stringify(newWebhook) });
      setCreatedWebhookSecret({ secret: data.secret, webhookId: data.webhookId });
      setNewWebhook({ name: '', url: '', events: [] });
      const updated = await api('/api/auth/webhooks');
      setWebhooks(updated.webhooks || []);
    } catch (err) { toast.error(err.message); }
    setWebhookLoading(false);
  };

  const toggleWebhook = async (webhookId, enabled) => {
    try {
      await api(`/api/auth/webhooks/${webhookId}`, { method: 'PATCH', body: JSON.stringify({ enabled }) });
      setWebhooks(prev => prev.map(w => w.webhookId === webhookId ? { ...w, enabled } : w));
    } catch (err) { toast.error(err.message); }
  };

  const deleteWebhook = async (webhookId) => {
    if (!window.confirm('Delete this webhook? This cannot be undone.')) return;
    try {
      await api(`/api/auth/webhooks/${webhookId}`, { method: 'DELETE' });
      setWebhooks(prev => prev.filter(w => w.webhookId !== webhookId));
      toast.success('Webhook deleted');
    } catch (err) { toast.error(err.message); }
  };

  const handleProfileSave = async () => {
    const goal = Number(profile.dailyGoalMinutes);
    if (!user?.enforceDailyGoal && (!Number.isInteger(goal) || goal < 1 || goal > 480)) {
      setGoalError('Daily goal must be a whole number between 1 and 480');
      return;
    }
    setGoalError('');
    try {
      await updateProfile({ ...profile, dailyGoalMinutes: goal });
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err.data?.error || err.message);
    }
  };

  const handleUsernameChange = async () => {
    const trimmed = newUsername.trim();
    if (!trimmed) { setUsernameError('Username is required'); return; }
    if (trimmed.length < 3) { setUsernameError('Username must be at least 3 characters'); return; }
    if (trimmed.length > 32) { setUsernameError('Username must be at most 32 characters'); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) { setUsernameError('Only letters, numbers, and underscores allowed'); return; }
    if (trimmed === user?.username) { setUsernameError('That is already your username'); return; }
    setUsernameError('');
    setUsernameSaving(true);
    try {
      await api('/api/auth/username', { method: 'PUT', body: JSON.stringify({ username: trimmed }) });
      toast.success('Username updated');
      setNewUsername('');
      await refreshUser();
    } catch (err) {
      setUsernameError(err.data?.error || err.message);
    }
    setUsernameSaving(false);
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

  const savePushPrefs = useCallback(async (newPrefs, newTime, qFrom, qUntil, maxNotifs) => {
    try {
      await api('/api/notifications/push/preferences', {
        method: 'PUT',
        body: JSON.stringify({
          pushPreferences: newPrefs,
          standupReminderTime: newTime,
          quietHoursFrom: qFrom,
          quietHoursUntil: qUntil,
          maxNotificationsPerDay: maxNotifs,
        }),
      });
    } catch { /* silent save */ }
  }, []);

  const togglePushPref = useCallback((key) => {
    setPushPrefs(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      savePushPrefs(updated, reminderTime, quietFrom, quietUntil, maxNotifsPerDay);
      return updated;
    });
  }, [savePushPrefs, reminderTime, quietFrom, quietUntil, maxNotifsPerDay]);

  const handleQuietFromChange = useCallback((value) => {
    setQuietFrom(value);
    savePushPrefs(pushPrefs, reminderTime, value, quietUntil, maxNotifsPerDay);
  }, [savePushPrefs, pushPrefs, reminderTime, quietUntil, maxNotifsPerDay]);

  const handleQuietUntilChange = useCallback((value) => {
    setQuietUntil(value);
    savePushPrefs(pushPrefs, reminderTime, quietFrom, value, maxNotifsPerDay);
  }, [savePushPrefs, pushPrefs, reminderTime, quietFrom, maxNotifsPerDay]);

  const handleMaxNotifsChange = useCallback((value) => {
    const val = Number(value);
    setMaxNotifsPerDay(val);
    savePushPrefs(pushPrefs, reminderTime, quietFrom, quietUntil, val);
  }, [savePushPrefs, pushPrefs, reminderTime, quietFrom, quietUntil]);

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
          {user?.canChangeUsername && (
            <div>
              <label className="text-xs text-zen-500 mb-1 block">New Username</label>
              <div className="flex gap-2">
                <input
                  value={newUsername}
                  onChange={(e) => { setNewUsername(e.target.value); setUsernameError(''); }}
                  className="glass-input flex-1"
                  placeholder="Enter new username"
                  maxLength={32}
                />
                <button onClick={handleUsernameChange} disabled={usernameSaving} className="btn-accent text-xs whitespace-nowrap">
                  {usernameSaving ? 'Saving...' : 'Change'}
                </button>
              </div>
              {usernameError && <p className="text-xs text-danger-400 mt-1">{usernameError}</p>}
              <p className="text-[10px] text-zen-600 mt-1">3–32 characters, letters, numbers, and underscores only</p>
            </div>
          )}
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
              <>
                <input type="number" min={1} max={480} value={profile.dailyGoalMinutes}
                  onChange={(e) => { setGoalError(''); setProfile({ ...profile, dailyGoalMinutes: e.target.value }); }}
                  className={`glass-input w-32 ${goalError ? 'border-danger-400' : ''}`} />
                {goalError && <p className="text-[10px] text-danger-400 mt-1">{goalError}</p>}
              </>
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
                { key: 'report_warning', label: 'Report Warning', desc: 'When someone reports your timer session' },
                { key: 'report_cleared', label: 'Report Cleared', desc: 'When your daily progress is cleared due to reports' },
                ...(['manager', 'admin', 'super_admin'].includes(user?.role) ? [
                  { key: 'admin_report_alert', label: 'Admin Report Alert', desc: 'When a user\'s progress is cleared by reports' },
                ] : []),
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

              {/* Quiet Hours */}
              <div className="border-t border-zen-700/30 pt-3 mt-2">
                <p className="text-xs text-zen-500 font-medium mb-2 flex items-center gap-1"><Clock size={12} /> Quiet Hours (UTC)</p>
                <p className="text-[10px] text-zen-600 mb-2">No notifications will be sent during this window. Supports overnight ranges (e.g. 22:00–07:00).</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] text-zen-600 block mb-0.5">From</label>
                    <input
                      type="time"
                      value={quietFrom}
                      onChange={(e) => handleQuietFromChange(e.target.value)}
                      className="glass-input w-full text-sm text-center"
                    />
                  </div>
                  <span className="text-zen-500 mt-4">–</span>
                  <div className="flex-1">
                    <label className="text-[10px] text-zen-600 block mb-0.5">Until</label>
                    <input
                      type="time"
                      value={quietUntil}
                      onChange={(e) => handleQuietUntilChange(e.target.value)}
                      className="glass-input w-full text-sm text-center"
                    />
                  </div>
                </div>
                {quietFrom === quietUntil && (
                  <p className="text-[10px] text-warn-400 mt-1">From and Until are the same — all notifications are suppressed.</p>
                )}
              </div>

              {/* Max Notifications Per Day */}
              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-sm text-zen-300">Max Notifications Per Day</p>
                  <p className="text-[10px] text-zen-600">Limit daily notification volume (critical alerts always bypass)</p>
                </div>
                <select
                  value={maxNotifsPerDay}
                  onChange={(e) => handleMaxNotifsChange(e.target.value)}
                  className="glass-input w-28 text-sm text-center"
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={0}>Unlimited</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </BentoCard>
      {/* API Access */}
      <BentoCard>
        <div className="flex items-center gap-2 mb-4">
          <Key size={16} className="text-accent-400" />
          <span className="text-sm font-semibold text-zen-200">API Access</span>
        </div>
        <p className="text-xs text-zen-500 mb-4">
          Generate API keys to control your timer from external tools or scripts. Each key authenticates as you.
        </p>

        {/* Revealed key — shown once */}
        {createdKey && (
          <div className="bg-accent-500/10 border border-accent-500/30 rounded-xl p-4 mb-4 space-y-2">
            <p className="text-xs font-semibold text-accent-300">Your new API key — copy it now, it will not be shown again</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono text-accent-200 bg-zen-900 px-3 py-2 rounded-lg break-all">{createdKey.key}</code>
              <button onClick={() => { navigator.clipboard.writeText(createdKey.key); toast.success('Copied'); }} className="btn-ghost p-2"><Copy size={14} /></button>
            </div>
            <button onClick={() => setCreatedKey(null)} className="text-xs text-zen-500 hover:text-zen-300">Dismiss</button>
          </div>
        )}

        {/* Existing keys */}
        {apiKeys.length > 0 && (
          <div className="space-y-2 mb-4">
            {apiKeys.map(k => (
              <div key={k.keyId} className="flex items-center justify-between py-2 px-3 bg-zen-800/40 rounded-lg">
                <div>
                  <p className="text-sm text-zen-200 font-medium">{k.name}</p>
                  <p className="text-[10px] text-zen-500 font-mono">{k.prefix}… · Created {new Date(k.createdAt).toLocaleDateString()}{k.lastUsedAt ? ` · Last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : ' · Never used'}</p>
                </div>
                <button onClick={() => revokeApiKey(k.keyId)} className="btn-ghost text-xs text-danger-400 flex items-center gap-1">
                  <Trash2 size={12} /> Revoke
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Create new key */}
        <div className="flex gap-2">
          <input
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            className="glass-input flex-1"
            placeholder="Key name (e.g. Home automation)"
            maxLength={100}
          />
          <button onClick={createApiKey} disabled={apiKeyLoading} className="btn-accent text-xs whitespace-nowrap flex items-center gap-1">
            <Plus size={12} /> {apiKeyLoading ? 'Creating…' : 'Create Key'}
          </button>
        </div>
        <p className="text-[10px] text-zen-600 mt-2">
          Authenticate with <code className="text-zen-400">Authorization: Bearer &lt;key&gt;</code> or <code className="text-zen-400">?api_key=&lt;key&gt;</code>
        </p>
      </BentoCard>

      {/* Webhooks */}
      <BentoCard>
        <div className="flex items-center gap-2 mb-4">
          <Webhook size={16} className="text-accent-400" />
          <span className="text-sm font-semibold text-zen-200">Webhooks</span>
        </div>
        <p className="text-xs text-zen-500 mb-4">
          Receive HTTP POST notifications when events happen. Payloads are signed with HMAC-SHA256.
        </p>

        {/* Revealed secret — shown once */}
        {createdWebhookSecret && (
          <div className="bg-accent-500/10 border border-accent-500/30 rounded-xl p-4 mb-4 space-y-2">
            <p className="text-xs font-semibold text-accent-300">Webhook signing secret — copy it now, it will not be shown again</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono text-accent-200 bg-zen-900 px-3 py-2 rounded-lg break-all">{createdWebhookSecret.secret}</code>
              <button onClick={() => { navigator.clipboard.writeText(createdWebhookSecret.secret); toast.success('Copied'); }} className="btn-ghost p-2"><Copy size={14} /></button>
            </div>
            <p className="text-[10px] text-zen-500">Verify the <code className="text-zen-400">X-StandupTracker-Signature: sha256=&lt;hex&gt;</code> header on incoming requests.</p>
            <button onClick={() => setCreatedWebhookSecret(null)} className="text-xs text-zen-500 hover:text-zen-300">Dismiss</button>
          </div>
        )}

        {/* Existing webhooks */}
        {webhooks.length > 0 && (
          <div className="space-y-3 mb-4">
            {webhooks.map(wh => (
              <div key={wh.webhookId} className="bg-zen-800/40 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <p className="text-sm text-zen-200 font-medium">{wh.name}</p>
                    <p className="text-[10px] text-zen-500 font-mono truncate max-w-xs">{wh.url}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleWebhook(wh.webhookId, !wh.enabled)}
                      className={`w-8 h-4 rounded-full transition-colors relative ${wh.enabled ? 'bg-accent-500' : 'bg-zen-700'}`}
                    >
                      <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-all ${wh.enabled ? 'left-4' : 'left-0.5'}`} />
                    </button>
                    <button onClick={() => deleteWebhook(wh.webhookId)} className="btn-ghost text-xs text-danger-400 p-1"><Trash2 size={12} /></button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {wh.events.map(ev => (
                    <span key={ev} className="text-[9px] px-1.5 py-0.5 bg-zen-700/50 rounded text-zen-400">{ev}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create new webhook */}
        {webhooks.length < 5 && (
          <div className="space-y-3 border-t border-zen-700/30 pt-3">
            <p className="text-xs text-zen-400 font-medium">Add webhook</p>
            <input
              value={newWebhook.name}
              onChange={(e) => setNewWebhook(w => ({ ...w, name: e.target.value }))}
              className="glass-input w-full"
              placeholder="Name (e.g. Zapier)"
              maxLength={100}
            />
            <input
              value={newWebhook.url}
              onChange={(e) => setNewWebhook(w => ({ ...w, url: e.target.value }))}
              className="glass-input w-full"
              placeholder="https://example.com/webhook"
            />
            <div>
              <p className="text-xs text-zen-500 mb-1">Events</p>
              <div className="flex flex-wrap gap-2">
                {WEBHOOK_EVENTS.map(ev => {
                  const active = newWebhook.events.includes(ev.value);
                  return (
                    <button
                      key={ev.value}
                      onClick={() => setNewWebhook(w => ({
                        ...w,
                        events: active ? w.events.filter(e => e !== ev.value) : [...w.events, ev.value],
                      }))}
                      className={`text-xs px-2 py-1 rounded-md border transition-colors ${active ? 'border-accent-500/50 bg-accent-500/20 text-accent-300' : 'border-zen-700/30 text-zen-500'}`}
                    >
                      {ev.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <button onClick={createWebhook} disabled={webhookLoading} className="btn-accent text-xs flex items-center gap-1">
              <Plus size={12} /> {webhookLoading ? 'Creating…' : 'Add Webhook'}
            </button>
          </div>
        )}
        {webhooks.length >= 5 && <p className="text-xs text-zen-500 border-t border-zen-700/30 pt-3">Maximum of 5 webhooks reached.</p>}
      </BentoCard>
    </div>
  );
}
