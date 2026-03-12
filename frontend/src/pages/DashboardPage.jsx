import { useEffect, useState, useMemo } from 'react';
import { BarChart3, Calendar, TrendingUp, Brain, Sparkles, ChevronDown, ChevronUp, Save, Zap } from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from 'chart.js';
import { api } from '../lib/api';
import { BentoCard, BentoGrid } from '../components/BentoCard';
import GitHubHeatmap from '../components/GitHubHeatmap';
import { daysAgo, formatMinutes, predictDailyGoal } from '../lib/utils';
import useAuthStore from '../stores/useAuthStore';
import useToastStore from '../stores/useToastStore';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

export default function DashboardPage() {
  const [tracking, setTracking] = useState({});
  const [stats, setStats] = useState(null);
  const [aiAdvice, setAiAdvice] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.refreshUser);

  useEffect(() => {
    const from = daysAgo(365);
    const to = daysAgo(0);
    Promise.all([
      api(`/api/tracking?from=${from}&to=${to}`),
      api('/api/stats'),
    ]).then(([t, s]) => {
      setTracking(t);
      setStats(s);
    }).catch(() => {});
  }, []);

  // Bar chart: last 30 days
  const barData = useMemo(() => {
    const labels = [];
    const data = [];
    for (let i = 29; i >= 0; i--) {
      const d = daysAgo(i);
      labels.push(d.slice(5));
      const val = tracking[d];
      const secs = typeof val === 'object' ? (val?.seconds || 0) : (val || 0);
      data.push(Math.round(secs / 60));
    }
    return {
      labels,
      datasets: [{
        data,
        backgroundColor: data.map((v) =>
          v >= (user?.dailyGoalMinutes || 30)
            ? 'rgba(16, 185, 129, 0.7)'
            : 'rgba(107, 107, 138, 0.4)'
        ),
        borderRadius: 4,
        borderSkipped: false,
      }],
    };
  }, [tracking, user]);

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: {
      label: (ctx) => `${ctx.raw} min`,
    }}},
    scales: {
      x: { grid: { display: false }, ticks: { color: '#6b6b8a', font: { size: 9 }, maxRotation: 45 }},
      y: { grid: { color: 'rgba(37,37,58,0.5)' }, ticks: { color: '#6b6b8a', callback: (v) => `${v}m` }},
    },
  };

  // AI Prediction
  const historyArr = useMemo(() => {
    return Object.entries(tracking)
      .map(([date, v]) => ({ date, seconds: typeof v === 'object' ? (v.seconds || 0) : (v || 0) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [tracking]);
  const prediction = predictDailyGoal(historyArr, user?.dailyGoalMinutes || 30);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-zen-100">Dashboard</h2>

      {/* Two-column layout: left = charts/stats, right = AI panel */}
      <div className="flex flex-col xl:flex-row gap-6">
        {/* Left column: charts, heatmap, stats */}
        <div className="flex-1 min-w-0 space-y-6">
          <BentoGrid>
            {/* 30-day chart */}
            <BentoCard className="md:col-span-2 xl:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 size={16} className="text-accent-400" />
                <span className="text-sm text-zen-400">Last 30 Days</span>
              </div>
              <div className="h-52">
                <Bar data={barData} options={barOptions} />
              </div>
            </BentoCard>

            {/* AI Prediction */}
            <BentoCard>
              <div className="flex items-center gap-2 mb-4">
                <Brain size={16} className="text-accent-400" />
                <span className="text-sm text-zen-400">AI Prediction</span>
              </div>
              {prediction ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-zen-500">Daily Average</p>
                    <p className="text-lg font-bold text-zen-100">{formatMinutes(prediction.avgSeconds)} min</p>
                  </div>
                  <div>
                    <p className="text-xs text-zen-500">Trend (7d)</p>
                    <p className={`text-lg font-bold ${prediction.trendSeconds >= 0 ? 'text-accent-400' : 'text-danger-400'}`}>
                      {prediction.trendSeconds >= 0 ? '+' : ''}{formatMinutes(prediction.trendSeconds)} min/day
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zen-500">Tomorrow Prediction</p>
                    <p className="text-lg font-bold text-zen-100">{formatMinutes(prediction.predictedSeconds)} min</p>
                  </div>
                  <div className={`text-xs px-3 py-1.5 rounded-lg inline-block ${
                    prediction.willMeetGoal ? 'bg-accent-500/10 text-accent-400' : 'bg-warn-500/10 text-warn-400'
                  }`}>
                    {prediction.willMeetGoal ? 'On track for goal' : 'May miss goal'}
                    {prediction.confidence < 1 && ` (${Math.round(prediction.confidence * 100)}% confidence)`}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zen-500">Need at least 3 days of data for predictions</p>
              )}
            </BentoCard>
          </BentoGrid>

          {/* Activity Heatmap */}
          <BentoCard>
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={16} className="text-accent-400" />
              <span className="text-sm text-zen-400">Activity Heatmap (52 weeks)</span>
            </div>
            <GitHubHeatmap data={tracking} darkMode={true} />
          </BentoCard>

          {/* Stats summary */}
          {(stats || user) && (
            <BentoGrid>
              <BentoCard>
                <p className="text-xs text-zen-500">Total Tracked</p>
                <p className="text-2xl font-bold text-zen-100 mt-1">{formatMinutes(user?.totalStandingSeconds ?? stats?.totalStandingSeconds ?? 0)} min</p>
              </BentoCard>
              <BentoCard>
                <p className="text-xs text-zen-500">Active Days</p>
                <p className="text-2xl font-bold text-zen-100 mt-1">{user?.totalDays ?? stats?.totalDays ?? 0}</p>
              </BentoCard>
              <BentoCard>
                <p className="text-xs text-zen-500">Avg / Active Day</p>
                <p className="text-2xl font-bold text-zen-100 mt-1">
                  {(user?.totalDays ?? stats?.totalDays)
                    ? formatMinutes(Math.round((user?.totalStandingSeconds ?? stats?.totalStandingSeconds ?? 0) / (user?.totalDays ?? stats?.totalDays)))
                    : 0} min
                </p>
              </BentoCard>
            </BentoGrid>
          )}
        </div>

        {/* Right column: AI Advice panel */}
        {user?.geminiOptIn && (
          <div className="w-full xl:w-96 xl:shrink-0">
            <div className="xl:sticky xl:top-6 space-y-4">
              {/* AI Advisor card */}
              <BentoCard className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles size={16} className="text-accent-400" />
                  <span className="text-sm font-semibold text-zen-200">AI Advisor</span>
                </div>
                {aiAdvice ? (
                  <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                    <p className="text-sm text-zen-200 whitespace-pre-line leading-relaxed">{aiAdvice.advice}</p>
                    <p className="text-[10px] text-zen-600 mt-2">
                      {aiAdvice.cached ? 'Cached' : 'Fresh'} — {new Date(aiAdvice.generatedAt).toLocaleString()}
                    </p>
                    <button
                      onClick={async () => {
                        setAiLoading(true);
                        try {
                          const data = await api('/api/ai/advice', { method: 'POST', body: JSON.stringify({ context: 'dashboard' }) });
                          setAiAdvice(data);
                        } catch { /* ignore */ }
                        setAiLoading(false);
                      }}
                      disabled={aiLoading}
                      className="btn-ghost text-xs"
                    >
                      {aiLoading ? 'Thinking...' : 'Refresh Advice'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-zen-500">Get personalized standing advice powered by AI</p>
                    <button
                      onClick={async () => {
                        setAiLoading(true);
                        try {
                          const data = await api('/api/ai/advice', { method: 'POST', body: JSON.stringify({ context: 'dashboard' }) });
                          setAiAdvice(data);
                        } catch { /* ignore */ }
                        setAiLoading(false);
                      }}
                      disabled={aiLoading}
                      className="btn-accent text-xs"
                    >
                      {aiLoading ? 'Thinking...' : 'Get Advice'}
                    </button>
                  </div>
                )}
              </BentoCard>

              {/* AI Settings */}
              <AiSettingsPanel user={user} refreshUser={refreshUser} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AiSettingsPanel({ user, refreshUser }) {
  const [expanded, setExpanded] = useState(false);
  const userPrompt = user?.aiSystemPrompt || '';
  const userTokens = user?.aiMaxTokens || 0;
  const [systemPrompt, setSystemPrompt] = useState(userPrompt);
  const [maxTokens, setMaxTokens] = useState(userTokens);
  const [saving, setSaving] = useState(false);
  const toast = useToastStore();

  // Sync local state when user data changes (e.g. after refreshUser)
  const [prevPrompt, setPrevPrompt] = useState(userPrompt);
  const [prevTokens, setPrevTokens] = useState(userTokens);
  if (userPrompt !== prevPrompt) { setPrevPrompt(userPrompt); setSystemPrompt(userPrompt); }
  if (userTokens !== prevTokens) { setPrevTokens(userTokens); setMaxTokens(userTokens); }

  const handleSave = async () => {
    setSaving(true);
    try {
      await api('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          aiSystemPrompt: systemPrompt,
          aiMaxTokens: maxTokens,
        }),
      });
      toast.success('AI settings saved');
      refreshUser();
    } catch (err) {
      toast.error(err.message || 'Failed to save');
    }
    setSaving(false);
  };

  return (
    <BentoCard className="p-5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full"
      >
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-accent-400" />
          <span className="text-sm font-semibold text-zen-200">Customize AI Behavior</span>
        </div>
        {expanded ? <ChevronUp size={16} className="text-zen-500" /> : <ChevronDown size={16} className="text-zen-500" />}
      </button>

      {expanded && (
        <div className="mt-4 space-y-5">
          {/* System Prompt */}
          <div>
            <label className="text-xs text-zen-400 block mb-1.5">AI System Prompt</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Custom instructions for the AI advisor... Leave empty to use the default."
              className="glass-input w-full text-sm min-h-[100px] resize-y"
              maxLength={2000}
            />
            <p className="text-[10px] text-zen-600 mt-1">
              {systemPrompt.length}/2000 — Prepended to every AI request. Leave empty for default behavior.
            </p>
          </div>

          {/* Max Response Length */}
          <div>
            <label className="text-xs text-zen-400 block mb-1.5">Max Response Length</label>
            <input
              type="number"
              value={maxTokens || ''}
              onChange={(e) => {
                const v = e.target.value === '' ? 0 : Number(e.target.value);
                setMaxTokens(v);
              }}
              placeholder="Default (set by admin)"
              min={0}
              max={2000}
              className="glass-input w-full text-sm"
            />
            <p className="text-[10px] text-zen-600 mt-1">
              Token budget (100–2000). Higher values allow longer AI responses but take more time. Set to 0 or leave empty to use the admin default.
            </p>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-accent text-xs flex items-center gap-1.5"
          >
            <Save size={12} />
            {saving ? 'Saving...' : 'Save AI Settings'}
          </button>
        </div>
      )}
    </BentoCard>
  );
}
