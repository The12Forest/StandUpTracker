// ============================================
// StandUpTracker — Main App Logic
// ============================================

(function () {
  // Auth check
  const token = localStorage.getItem('sut_token');
  if (!token) { window.location.href = '/login'; return; }

  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  let currentUser = JSON.parse(localStorage.getItem('sut_user') || '{}');
  let data = {};
  let goal = currentUser.dailyGoalMinutes || 60;
  let tracking = false;
  let trackingStart = null;
  let barChart = null;

  // Helpers
  const pad = n => n < 10 ? '0' + n : n;
  const fmt = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${pad(h)}:${pad(m)}:${pad(x)}`; };
  const fmtShort = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h > 0 ? `${h}h ${pad(m)}m` : `${m}m`; };
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const escapeHtml = t => { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; };

  function showToast(msg, type = 'success') {
    const c = document.getElementById('toastContainer');
    if (!c) return;
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  // ============================================
  // Socket.io Connection
  // ============================================
  let socket = null;
  function initSocket() {
    socket = io({ auth: { token } });

    socket.on('connect', () => console.log('WS connected'));

    socket.on('STATE_SYNC', (state) => {
      const el = document.getElementById('globalCounterStatus');
      if (state.running) {
        el.style.display = 'block';
        el.textContent = `Global counter running (started by ${state.startedBy})`;
      } else {
        el.style.display = 'none';
      }
    });

    socket.on('TRACKING_SYNC', (syncData) => {
      // Another device updated tracking
      if (syncData.tracking !== undefined) {
        tracking = syncData.tracking;
        trackingStart = syncData.trackingStart;
        updateTimerUI();
      }
      if (syncData.data) {
        Object.assign(data, syncData.data);
      }
    });

    socket.on('disconnect', () => console.log('WS disconnected'));

    // Heartbeat for PWA keep-alive
    setInterval(() => {
      if (socket && socket.connected) socket.emit('HEARTBEAT');
    }, 30000);
  }

  // ============================================
  // Data Loading
  // ============================================
  async function loadUserData() {
    try {
      const [meRes, trackRes] = await Promise.all([
        fetch('/api/auth/me', { headers }),
        fetch('/api/tracking', { headers }),
      ]);

      if (meRes.status === 401) { logout(); return; }

      currentUser = await meRes.json();
      localStorage.setItem('sut_user', JSON.stringify(currentUser));
      data = await trackRes.json();
      goal = currentUser.dailyGoalMinutes || 60;

      // Restore local tracking state
      const localState = JSON.parse(localStorage.getItem('sut_tracking') || '{}');
      if (localState.tracking) {
        tracking = true;
        trackingStart = localState.trackingStart;
      }

      setupUI();
    } catch (err) {
      showToast('Failed to load data', 'error');
    }
  }

  function setupUI() {
    // Email verification banner
    if (!currentUser.emailVerified) {
      document.getElementById('verifyBanner').classList.remove('hidden');
    }

    // Admin link
    if (['admin', 'super_admin'].includes(currentUser.role)) {
      document.getElementById('adminLink').style.display = '';
    }

    // Settings info
    document.getElementById('infoUserId').textContent = currentUser.userId;
    document.getElementById('infoRole').innerHTML = `<span class="badge badge-info">${currentUser.role}</span>`;
    document.getElementById('infoUsername').textContent = currentUser.username;
    document.getElementById('infoEmail').textContent = currentUser.email;
    document.getElementById('infoCreated').textContent = new Date(currentUser.createdAt).toLocaleDateString();
    document.getElementById('infoVerified').innerHTML = currentUser.emailVerified
      ? '<span class="badge badge-success">Yes</span>'
      : '<span class="badge badge-danger">No</span>';

    // Theme select
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) themeSelect.value = currentUser.theme || 'dark';

    // Goal
    const goalInput = document.getElementById('goalInput');
    if (goalInput) goalInput.value = goal;

    // 2FA status
    updateTotpUI();
    updateEmail2faUI();

    // Timer UI
    updateTimerUI();

    // Features
    if (typeof Features !== 'undefined') {
      document.getElementById('reminderSettings').innerHTML = Features.renderReminderSettings();
    }
  }

  // ============================================
  // Timer Logic
  // ============================================
  function getCurrentSessionTime() {
    if (!tracking || !trackingStart) return 0;
    return Math.floor((Date.now() - trackingStart) / 1000);
  }

  function getTotalToday() {
    const k = today();
    return (data[k] || 0) + getCurrentSessionTime();
  }

  function updateTimerUI() {
    const timerEl = document.getElementById('timer');
    const btnText = document.getElementById('startStopText');
    const totalSec = getTotalToday();

    timerEl.textContent = fmt(totalSec);
    timerEl.classList.toggle('timer-running', tracking);

    btnText.textContent = tracking ? 'Stop' : 'Start Standing';

    // KPIs
    document.getElementById('kpiToday').textContent = fmtShort(totalSec);
    const pct = goal > 0 ? Math.min(100, Math.round((totalSec / (goal * 60)) * 100)) : 0;
    document.getElementById('kpiGoalPct').textContent = pct + '%';
    document.getElementById('kpiStreak').textContent = currentUser.currentStreak || 0;
    document.getElementById('kpiLevel').textContent = 'Lv.' + (currentUser.level || 1);
  }

  window.toggleTracking = function () {
    if (!tracking) {
      tracking = true;
      trackingStart = Date.now();
    } else {
      const sessionTime = getCurrentSessionTime();
      const k = today();
      data[k] = (data[k] || 0) + sessionTime;
      tracking = false;
      trackingStart = null;

      // Save to server
      saveTrackingData(k, data[k], { start: new Date(Date.now() - sessionTime * 1000), end: new Date(), duration: sessionTime });

      // Check achievements
      if (typeof Features !== 'undefined') {
        Features.checkAchievements(data, goal);
        Features.checkChallenges(data, goal, getTotalToday());
      }
    }

    // Persist locally
    localStorage.setItem('sut_tracking', JSON.stringify({ tracking, trackingStart }));

    // Sync to other devices
    if (socket) {
      socket.emit('TRACKING_UPDATE', { tracking, trackingStart, data: { [today()]: data[today()] } });
    }

    updateTimerUI();
  };

  async function saveTrackingData(date, seconds, session) {
    try {
      await fetch('/api/tracking', {
        method: 'POST', headers,
        body: JSON.stringify({ date, seconds, session }),
      });
    } catch { /* will retry on next sync */ }
  }

  window.resetToday = function () {
    if (!confirm('Reset today\'s time?')) return;
    const k = today();
    data[k] = 0;
    if (tracking) trackingStart = Date.now();
    saveTrackingData(k, 0);
    updateTimerUI();
  };

  // ============================================
  // Statistics
  // ============================================
  function updateStats() {
    const keys = Object.keys(data).sort();
    const arr = keys.slice(-30);
    const secs = arr.map(k => data[k] || 0);
    const todayKey = today();
    const todayIndex = arr.indexOf(todayKey);
    if (todayIndex >= 0 && tracking) secs[todayIndex] += getCurrentSessionTime();

    const work = arr.map((k, i) => secs[i] > 180 ? { day: k, sec: secs[i] } : null).filter(Boolean);
    const t = work.reduce((a, b) => a + b.sec, 0);
    const avg = work.length ? t / work.length : 0;

    document.getElementById('kpiStatToday').textContent = fmtShort(secs[secs.length - 1] || 0);
    document.getElementById('kpiAvg').textContent = fmtShort(avg);
    document.getElementById('kpiSum').textContent = fmtShort(t);

    let streak = 0, best = 0, run = 0;
    secs.forEach(s => { if (s >= goal * 60) { run++; best = Math.max(best, run); } else run = 0; });
    for (let i = secs.length - 1; i >= 0; i--) { if (secs[i] >= goal * 60) streak++; else break; }

    document.getElementById('kpiStatStreak').textContent = streak;
    document.getElementById('kpiBest').textContent = best;

    // Table
    let tb = '';
    work.forEach(o => {
      const ok = o.sec >= goal * 60;
      tb += `<tr><td>${o.day}</td><td class="text-mono">${fmt(o.sec)}</td><td class="${ok ? 'goal-reached' : 'goal-missed'}">${ok ? '✔' : '✘'}</td></tr>`;
    });
    document.getElementById('statsTable').innerHTML = tb;

    drawHeatmap();
    drawChart(work);
  }

  function drawHeatmap() {
    const root = document.getElementById('heatmap');
    const monthsRow = document.getElementById('heatmapMonths');
    root.innerHTML = '';
    monthsRow.innerHTML = '';

    const numWeeks = 52;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (numWeeks * 7) + (7 - endDate.getDay()));

    const colormap = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];
    let lastMonth = -1;
    const monthPositions = [];
    const currentDate = new Date(startDate);

    for (let week = 0; week < numWeeks; week++) {
      const col = document.createElement('div');
      col.className = 'hcol';
      for (let day = 0; day < 7; day++) {
        const box = document.createElement('div');
        box.className = 'hcell';
        if (currentDate > endDate) {
          box.style.visibility = 'hidden';
        } else {
          const k = `${currentDate.getFullYear()}-${pad(currentDate.getMonth() + 1)}-${pad(currentDate.getDate())}`;
          const minutes = (data[k] || 0) / 60;
          const pct = goal > 0 ? (minutes / goal) * 100 : 0;
          const lvl = pct >= 100 ? 4 : pct >= 75 ? 3 : pct >= 50 ? 2 : pct > 0 ? 1 : 0;
          box.style.background = colormap[lvl];
          box.title = `${k}: ${fmtShort(minutes * 60)}`;
          const month = currentDate.getMonth();
          if (month !== lastMonth) { monthPositions.push({ week, month }); lastMonth = month; }
        }
        col.appendChild(box);
        currentDate.setDate(currentDate.getDate() + 1);
      }
      root.appendChild(col);
    }

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    monthPositions.forEach((pos, i) => {
      const span = document.createElement('span');
      span.className = 'heatmap-month';
      span.textContent = monthNames[pos.month];
      span.style.marginLeft = (i === 0 ? pos.week * 14 : 0) + 'px';
      span.style.flex = i < monthPositions.length - 1 ? (monthPositions[i + 1].week - pos.week) : (numWeeks - pos.week);
      monthsRow.appendChild(span);
    });
  }

  function drawChart(work) {
    const ctx = document.getElementById('barChart');
    if (!ctx) return;
    const labels = work.map(x => x.day);
    const mins = work.map(x => Math.round(x.sec / 60));
    const barColors = mins.map(m => m >= goal ? 'rgba(54,209,196,0.95)' : 'rgba(91,134,229,0.95)');

    if (barChart) {
      barChart.data.labels = labels;
      barChart.data.datasets[0].data = mins;
      barChart.data.datasets[0].backgroundColor = barColors;
      barChart.update();
    } else if (typeof Chart !== 'undefined') {
      barChart = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Minutes', data: mins, backgroundColor: barColors, borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: {
            x: { ticks: { color: '#8b92b0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#8b92b0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          },
          plugins: { legend: { labels: { color: '#8b92b0' } } },
        },
      });
    }
  }

  // ============================================
  // Gamification
  // ============================================
  function updateGamification() {
    if (typeof Features === 'undefined') return;
    const stats = Features.calculateStats(data, goal);
    document.getElementById('levelPanel').innerHTML = Features.renderLevelPanel(stats.totalSeconds);
    document.getElementById('challengesPanel').innerHTML = Features.renderChallengesPanel(data, goal, getTotalToday());
    document.getElementById('achievementsPanel').innerHTML = Features.renderAchievementsPanel();
  }

  // ============================================
  // Settings Actions
  // ============================================
  window.saveGoal = async function () {
    const val = parseInt(document.getElementById('goalInput').value) || 60;
    goal = val;
    try {
      await fetch('/api/auth/profile', {
        method: 'PUT', headers,
        body: JSON.stringify({ dailyGoalMinutes: val }),
      });
      showToast('Goal saved');
    } catch { showToast('Failed to save goal', 'error'); }
  };

  // Change Email
  document.getElementById('emailForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/email', {
        method: 'PUT', headers,
        body: JSON.stringify({
          newEmail: document.getElementById('newEmail').value,
          password: document.getElementById('emailPassword').value,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      showToast(d.message);
      e.target.reset();
    } catch (err) { showToast(err.message, 'error'); }
  });

  // Change Password
  document.getElementById('passwordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/password', {
        method: 'PUT', headers,
        body: JSON.stringify({
          currentPassword: document.getElementById('currentPassword').value,
          newPassword: document.getElementById('newPassword').value,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      showToast(d.message);
      e.target.reset();
    } catch (err) { showToast(err.message, 'error'); }
  });

  // ============================================
  // 2FA Management
  // ============================================
  function updateTotpUI() {
    const el = document.getElementById('totpStatus');
    if (!el) return;
    if (currentUser.totpEnabled) {
      el.innerHTML = `<div class="flex items-center gap-sm"><span class="badge badge-success">Enabled</span><button class="btn btn-sm btn-danger" onclick="disableTotp()">Disable</button></div>`;
    } else {
      el.innerHTML = `<button class="btn btn-sm btn-primary" onclick="setupTotp()">Enable</button>`;
    }
  }

  window.setupTotp = async function () {
    try {
      const res = await fetch('/api/auth/2fa/totp/setup', { method: 'POST', headers });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);

      const area = document.getElementById('totpSetupArea');
      area.classList.remove('hidden');
      area.innerHTML = `
        <div class="glass-sm card-compact mt-sm">
          <p class="text-sm mb-md">Scan this QR code with your authenticator app:</p>
          <div class="text-center mb-md"><img src="${d.qrDataUrl}" alt="TOTP QR Code" style="border-radius:8px;max-width:200px"></div>
          <p class="text-xs text-muted mb-md">Manual key: <code class="text-mono">${escapeHtml(d.secret)}</code></p>
          <div class="flex items-center gap-sm">
            <input type="text" id="totpVerifyCode" class="form-input text-mono" placeholder="Enter 6-digit code" maxlength="6" style="max-width:200px">
            <button class="btn btn-primary btn-sm" onclick="verifyTotp()">Verify & Enable</button>
          </div>
        </div>
      `;
    } catch (err) { showToast(err.message, 'error'); }
  };

  window.verifyTotp = async function () {
    const code = document.getElementById('totpVerifyCode').value;
    try {
      const res = await fetch('/api/auth/2fa/totp/enable', {
        method: 'POST', headers,
        body: JSON.stringify({ code }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);

      currentUser.totpEnabled = true;
      localStorage.setItem('sut_user', JSON.stringify(currentUser));
      document.getElementById('totpSetupArea').innerHTML = `
        <div class="glass-sm card-compact mt-sm">
          <p class="text-sm" style="color:var(--success)">TOTP 2FA enabled!</p>
          <p class="text-sm mb-md">Save these recovery codes:</p>
          <div class="text-mono text-sm" style="background:var(--bg-input);padding:12px;border-radius:8px">${d.recoveryCodes.join('<br>')}</div>
        </div>
      `;
      updateTotpUI();
      showToast('TOTP 2FA enabled');
    } catch (err) { showToast(err.message, 'error'); }
  };

  window.disableTotp = async function () {
    const password = prompt('Enter your password to disable TOTP 2FA:');
    if (!password) return;
    try {
      const res = await fetch('/api/auth/2fa/totp/disable', {
        method: 'POST', headers,
        body: JSON.stringify({ password }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      currentUser.totpEnabled = false;
      localStorage.setItem('sut_user', JSON.stringify(currentUser));
      document.getElementById('totpSetupArea').classList.add('hidden');
      updateTotpUI();
      showToast('TOTP 2FA disabled');
    } catch (err) { showToast(err.message, 'error'); }
  };

  function updateEmail2faUI() {
    const el = document.getElementById('email2faStatus');
    if (!el) return;
    if (currentUser.email2faEnabled) {
      el.innerHTML = `<div class="flex items-center gap-sm"><span class="badge badge-success">Enabled</span><button class="btn btn-sm btn-danger" onclick="disableEmail2fa()">Disable</button></div>`;
    } else {
      el.innerHTML = `<button class="btn btn-sm btn-primary" onclick="enableEmail2fa()">Enable</button>`;
    }
  }

  window.enableEmail2fa = async function () {
    try {
      const res = await fetch('/api/auth/2fa/email/enable', { method: 'POST', headers });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      currentUser.email2faEnabled = true;
      localStorage.setItem('sut_user', JSON.stringify(currentUser));
      updateEmail2faUI();
      showToast('Email 2FA enabled');
    } catch (err) { showToast(err.message, 'error'); }
  };

  window.disableEmail2fa = async function () {
    const password = prompt('Enter your password to disable email 2FA:');
    if (!password) return;
    try {
      const res = await fetch('/api/auth/2fa/email/disable', {
        method: 'POST', headers,
        body: JSON.stringify({ password }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      currentUser.email2faEnabled = false;
      localStorage.setItem('sut_user', JSON.stringify(currentUser));
      updateEmail2faUI();
      showToast('Email 2FA disabled');
    } catch (err) { showToast(err.message, 'error'); }
  };

  // ============================================
  // Data Management
  // ============================================
  window.syncFromLocal = async function () {
    const oldData = JSON.parse(localStorage.getItem('standuptracker') || '{}');
    if (!oldData.data || Object.keys(oldData.data).length === 0) {
      showToast('No local data to sync', 'warning');
      return;
    }
    try {
      const res = await fetch('/api/tracking/sync', {
        method: 'POST', headers,
        body: JSON.stringify({ data: oldData.data }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      showToast(d.message);
      Object.assign(data, oldData.data);
    } catch (err) { showToast(err.message, 'error'); }
  };

  window.exportCSV = function () {
    let out = 'Date,Seconds,Formatted\n';
    Object.keys(data).sort().forEach(k => {
      if (data[k] > 0) out += `${k},${data[k]},${fmt(data[k])}\n`;
    });
    const b = new Blob([out], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = 'standup-data.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  window.clearAllData = function () {
    if (!confirm('Delete ALL your tracking data? This cannot be undone.')) return;
    // TODO: Add server-side delete endpoint
    data = {};
    localStorage.removeItem('standuptracker');
    showToast('Local data cleared');
  };

  window.resendVerification = async function () {
    try {
      const res = await fetch('/api/auth/resend-verification', { method: 'POST', headers });
      const d = await res.json();
      showToast(d.message);
    } catch { showToast('Failed to resend', 'error'); }
  };

  // ============================================
  // Page Navigation
  // ============================================
  window.showPage = function (id, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-link[data-page]').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    // Close mobile menu
    document.getElementById('navMenu').classList.remove('open');

    if (id === 'stats') updateStats();
    if (id === 'achievements') updateGamification();
  };

  window.logout = function () {
    localStorage.removeItem('sut_token');
    localStorage.removeItem('sut_user');
    localStorage.removeItem('sut_tracking');
    window.location.href = '/login';
  };

  // ============================================
  // Auto-update loops
  // ============================================
  setInterval(updateTimerUI, 200);
  setInterval(() => {
    if (tracking) {
      // Auto-save to server periodically
      const k = today();
      const total = (data[k] || 0) + getCurrentSessionTime();
      saveTrackingData(k, total);
    }
  }, 30000);

  // Check reminders
  setInterval(() => {
    if (typeof Features !== 'undefined') Features.checkReminders();
  }, 60000);

  // Check goal celebration
  setInterval(() => {
    if (typeof Features !== 'undefined') Features.checkGoalCelebration(getTotalToday(), goal);
  }, 5000);

  // ============================================
  // Initialize
  // ============================================
  initSocket();
  loadUserData();

  // Expose for Features module
  window.tracking = tracking;
  window.trackingStart = trackingStart;
})();
