import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  BarChart3, Calendar, TrendingUp, Brain, Sparkles, RefreshCw, Clock,
  Award, Target, Flame, ArrowUpRight, ArrowDownRight, Minus, Zap, Trophy
} from 'lucide-react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from 'chart.js';
import ReactMarkdown from 'react-markdown';
import { api } from '../lib/api';
import { BentoCard, BentoGrid } from '../components/BentoCard';
import GitHubHeatmap from '../components/GitHubHeatmap';
import { daysAgo, formatMinutes, predictDailyGoal } from '../lib/utils';
import useAuthStore from '../stores/useAuthStore';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

function CooldownTimer({ nextRefreshAt, onReady }) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    if (!nextRefreshAt) return;
    const target = new Date(nextRefreshAt).getTime();

    function tick() {
      const diff = target - Date.now();
      if (diff <= 0) {
        setRemaining('');
        onReady?.();
        return;
      }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${m}:${String(s).padStart(2, '0')}`);
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextRefreshAt, onReady]);

  if (!remaining) return null;
  return (
    <span className="text-[10px] text-zen-500 flex items-center gap-1">
      <Clock size={10} />
      Refresh in {remaining}
    </span>
  );
}

function formatHm(secs) {
  if (!secs || secs <= 0) return '0m';
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

function ChangeIndicator({ value }) {
  if (value === 0) return <span className="text-zen-500 flex items-center gap-0.5"><Minus size={10} /> 0%</span>;
  if (value > 0) return <span className="text-accent-400 flex items-center gap-0.5"><ArrowUpRight size={10} /> +{value}%</span>;
  return <span className="text-danger-400 flex items-center gap-0.5"><ArrowDownRight size={10} /> {value}%</span>;
}

export default function DashboardPage() {
  const [tracking, setTracking] = useState({});
  const [offDays, setOffDays] = useState({});
  const [stats, setStats] = useState(null);
  const [extStats, setExtStats] = useState(null);
  const [aiAdvice, setAiAdvice] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [cooldownActive, setCooldownActive] = useState(false);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    const from = daysAgo(365);
    const to = daysAgo(0);
    Promise.all([
      api(`/api/tracking?from=${from}&to=${to}`),
      api('/api/stats'),
      api('/api/stats/extended'),
    ]).then(([t, s, e]) => {
      // tracking endpoint now returns { tracking, offDays }
      setTracking(t.tracking || t);
      if (t.offDays) setOffDays(t.offDays);
      setStats(s);
      setExtStats(e);
    }).catch(() => {});
  }, []);

  // Load cached AI advice on mount
  useEffect(() => {
    if (!user?.geminiOptIn) return;
    api('/api/ai/advice?context=dashboard')
      .then(data => {
        if (data.advice) {
          setAiAdvice(data);
          if (data.nextRefreshAt && new Date(data.nextRefreshAt) > new Date()) {
            setCooldownActive(true);
          }
        }
      })
      .catch(() => {});
  }, [user?.geminiOptIn]);

  const handleCooldownReady = useCallback(() => setCooldownActive(false), []);

  const requestAdvice = async (forceRefresh = false) => {
    setAiLoading(true);
    try {
      const data = await api('/api/ai/advice', {
        method: 'POST',
        body: JSON.stringify({ context: 'dashboard', forceRefresh }),
      });
      setAiAdvice(data);
      if (data.nextRefreshAt) setCooldownActive(true);
    } catch (err) {
      if (err.status === 429 && err.data?.advice) {
        setAiAdvice(err.data);
        setCooldownActive(true);
      }
    }
    setAiLoading(false);
  };

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

  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);
  const generatedAgo = aiAdvice?.generatedAt
    ? Math.round((nowTs - new Date(aiAdvice.generatedAt).getTime()) / 60000)
    : null;

  const pr = extStats?.personalRecords;
  const prog = extStats?.progress;
  const goals = extStats?.goals;

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
            <GitHubHeatmap data={tracking} offDays={offDays} darkMode={true} />
          </BentoCard>

          {/* Quick Stats summary */}
          {(stats || user) && (
            <BentoGrid>
              <BentoCard>
                <p className="text-xs text-zen-500">Total Tracked</p>
                <p className="text-2xl font-bold text-zen-100 mt-1">{formatHm(user?.totalStandingSeconds ?? stats?.totalStandingSeconds ?? 0)}</p>
              </BentoCard>
              <BentoCard>
                <p className="text-xs text-zen-500">Active Days</p>
                <p className="text-2xl font-bold text-zen-100 mt-1">{user?.totalDays ?? stats?.totalDays ?? 0}</p>
              </BentoCard>
              <BentoCard>
                <p className="text-xs text-zen-500">Avg / Active Day</p>
                <p className="text-2xl font-bold text-zen-100 mt-1">
                  {(user?.totalDays ?? stats?.totalDays)
                    ? formatHm(Math.round((user?.totalStandingSeconds ?? stats?.totalStandingSeconds ?? 0) / (user?.totalDays ?? stats?.totalDays)))
                    : '0m'}
                </p>
              </BentoCard>
            </BentoGrid>
          )}

          {/* ── Personal Records ── */}
          {pr && (
            <div>
              <h3 className="text-sm font-semibold text-zen-300 mb-3 flex items-center gap-2">
                <Trophy size={14} className="text-accent-400" /> Personal Records
              </h3>
              <BentoGrid>
                <BentoCard>
                  <p className="text-xs text-zen-500">Longest Session</p>
                  <p className="text-xl font-bold text-zen-100 mt-1">{pr.longestSession ? formatHm(pr.longestSession.seconds) : '—'}</p>
                  {pr.longestSession && <p className="text-[10px] text-zen-500 mt-0.5">{pr.longestSession.date}</p>}
                </BentoCard>
                <BentoCard>
                  <p className="text-xs text-zen-500">Best Day</p>
                  <p className="text-xl font-bold text-zen-100 mt-1">{pr.bestDay ? formatHm(pr.bestDay.seconds) : '—'}</p>
                  {pr.bestDay && <p className="text-[10px] text-zen-500 mt-0.5">{pr.bestDay.date}</p>}
                </BentoCard>
                <BentoCard>
                  <p className="text-xs text-zen-500">Best Week</p>
                  <p className="text-xl font-bold text-zen-100 mt-1">{pr.bestWeek ? formatHm(pr.bestWeek.seconds) : '—'}</p>
                  {pr.bestWeek && <p className="text-[10px] text-zen-500 mt-0.5">Week of {pr.bestWeek.weekStart}</p>}
                </BentoCard>
                <BentoCard>
                  <p className="text-xs text-zen-500">Best Month</p>
                  <p className="text-xl font-bold text-zen-100 mt-1">{pr.bestMonth ? formatHm(pr.bestMonth.seconds) : '—'}</p>
                  {pr.bestMonth && <p className="text-[10px] text-zen-500 mt-0.5">{pr.bestMonth.month}</p>}
                </BentoCard>
                <BentoCard>
                  <p className="text-xs text-zen-500">Total Sessions</p>
                  <p className="text-xl font-bold text-zen-100 mt-1">{pr.totalSessions}</p>
                  <p className="text-[10px] text-zen-500 mt-0.5">Avg: {formatHm(pr.avgSessionDuration)}</p>
                </BentoCard>
                <BentoCard>
                  <p className="text-xs text-zen-500">Total Standing Time</p>
                  <p className="text-xl font-bold text-zen-100 mt-1">{formatHm(pr.totalSeconds)}</p>
                </BentoCard>
              </BentoGrid>
            </div>
          )}

          {/* ── Progress & Trends ── */}
          {prog && (
            <div>
              <h3 className="text-sm font-semibold text-zen-300 mb-3 flex items-center gap-2">
                <TrendingUp size={14} className="text-accent-400" /> Progress & Trends
              </h3>
              <BentoGrid>
                <BentoCard className="md:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-zen-500">Level {prog.level}{prog.nextLevel ? ` → ${prog.nextLevel}` : ' (Max)'}</p>
                    <p className="text-xs text-zen-400">{prog.totalHours}h total</p>
                  </div>
                  <div className="w-full bg-zen-800 rounded-full h-3">
                    <div
                      className="bg-accent-500 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${prog.levelProgress}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-zen-600">{prog.currentLevelHours}h</span>
                    {prog.nextLevelHours && <span className="text-[10px] text-zen-600">{prog.nextLevelHours}h</span>}
                  </div>
                </BentoCard>
                <BentoCard>
                  <p className="text-xs text-zen-500">Week over Week</p>
                  <div className="text-xl font-bold mt-1"><ChangeIndicator value={prog.weekOverWeekChange} /></div>
                </BentoCard>
                <BentoCard>
                  <p className="text-xs text-zen-500">Month over Month</p>
                  <div className="text-xl font-bold mt-1"><ChangeIndicator value={prog.monthOverMonthChange} /></div>
                </BentoCard>
                <BentoCard>
                  <p className="text-xs text-zen-500">Consistency (30d)</p>
                  <p className="text-xl font-bold text-zen-100 mt-1">{prog.consistencyScore}%</p>
                  <p className="text-[10px] text-zen-500 mt-0.5">Days goal met in last 30</p>
                </BentoCard>
              </BentoGrid>
            </div>
          )}

          {/* ── Goal Tracking ── */}
          {goals && (
            <div>
              <h3 className="text-sm font-semibold text-zen-300 mb-3 flex items-center gap-2">
                <Target size={14} className="text-accent-400" /> Goal Tracking
              </h3>
              <BentoGrid>
                <BentoCard>
                  <p className="text-xs text-zen-500">Daily Goal</p>
                  <p className="text-xl font-bold text-zen-100 mt-1">{goals.dailyGoalMinutes} min</p>
                  {goals.enforced && <p className="text-[10px] text-warn-400 mt-0.5">Admin-enforced</p>}
                </BentoCard>
                <BentoCard>
                  <p className="text-xs text-zen-500">Goal Met This Week</p>
                  <p className="text-xl font-bold text-zen-100 mt-1">{goals.goalMetThisWeek} / 7</p>
                </BentoCard>
                <BentoCard>
                  <p className="text-xs text-zen-500">Goal Met This Month</p>
                  <p className="text-xl font-bold text-zen-100 mt-1">{goals.goalMetThisMonth}</p>
                </BentoCard>
                <BentoCard>
                  <p className="text-xs text-zen-500">All-Time Completion</p>
                  <p className="text-xl font-bold text-zen-100 mt-1">{goals.goalCompletionRate}%</p>
                  <p className="text-[10px] text-zen-500 mt-0.5">{goals.daysGoalMet} / {goals.daysTracked} days</p>
                </BentoCard>
              </BentoGrid>
            </div>
          )}
        </div>

        {/* Right column: AI Advice panel — full height */}
        {user?.geminiOptIn && (
          <div className="w-full xl:w-96 xl:shrink-0">
            <div className="xl:sticky xl:top-6 flex flex-col" style={{ maxHeight: 'calc(100vh - 6rem)' }}>
              <BentoCard className="p-5 flex flex-col flex-1 min-h-0">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-accent-400" />
                    <span className="text-sm font-semibold text-zen-200">AI Advisor</span>
                  </div>
                  {aiAdvice && (
                    <CooldownTimer nextRefreshAt={aiAdvice.nextRefreshAt} onReady={handleCooldownReady} />
                  )}
                </div>

                {aiAdvice?.advice ? (
                  <div className="flex flex-col flex-1 min-h-0">
                    <div className="flex-1 overflow-y-auto pr-1 mb-3 prose-ai">
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p className="text-sm text-zen-200 leading-relaxed mb-2">{children}</p>,
                          ul: ({ children }) => <ul className="text-sm text-zen-200 list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                          ol: ({ children }) => <ol className="text-sm text-zen-200 list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                          li: ({ children }) => <li className="text-sm text-zen-200 leading-relaxed">{children}</li>,
                          strong: ({ children }) => <strong className="text-zen-100 font-semibold">{children}</strong>,
                          em: ({ children }) => <em className="text-zen-300">{children}</em>,
                          h1: ({ children }) => <h3 className="text-base font-bold text-zen-100 mb-2">{children}</h3>,
                          h2: ({ children }) => <h3 className="text-sm font-bold text-zen-100 mb-2">{children}</h3>,
                          h3: ({ children }) => <h4 className="text-sm font-semibold text-zen-200 mb-1">{children}</h4>,
                          code: ({ children }) => <code className="text-xs bg-zen-800 text-accent-400 px-1 py-0.5 rounded">{children}</code>,
                          blockquote: ({ children }) => <blockquote className="border-l-2 border-accent-500/30 pl-3 text-zen-300 italic">{children}</blockquote>,
                        }}
                      >
                        {aiAdvice.advice}
                      </ReactMarkdown>
                    </div>

                    <div className="border-t border-zen-700/30 pt-3 space-y-2">
                      <p className="text-[10px] text-zen-600">
                        {aiAdvice.cached ? 'Cached' : 'Fresh'}
                        {generatedAgo !== null && ` — Generated ${generatedAgo < 1 ? 'just now' : `${generatedAgo}m ago`}`}
                      </p>
                      <button
                        onClick={() => requestAdvice(true)}
                        disabled={aiLoading || cooldownActive}
                        className="btn-ghost text-xs flex items-center gap-1.5 disabled:opacity-40"
                      >
                        <RefreshCw size={12} className={aiLoading ? 'animate-spin' : ''} />
                        {aiLoading ? 'Thinking...' : cooldownActive ? 'Cooldown active' : 'Refresh Advice'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-zen-500">Get personalized standing advice powered by AI</p>
                    <button
                      onClick={() => requestAdvice(false)}
                      disabled={aiLoading}
                      className="btn-accent text-xs flex items-center gap-1.5"
                    >
                      <Sparkles size={12} className={aiLoading ? 'animate-spin' : ''} />
                      {aiLoading ? 'Thinking...' : 'Get Advice'}
                    </button>
                  </div>
                )}
              </BentoCard>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
