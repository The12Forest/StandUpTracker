import { useEffect, useState, useMemo } from 'react';
import { BarChart3, Calendar, TrendingUp, Brain, Sparkles } from 'lucide-react';
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

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

export default function DashboardPage() {
  const [tracking, setTracking] = useState({});
  const [stats, setStats] = useState(null);
  const [aiAdvice, setAiAdvice] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const user = useAuthStore((s) => s.user);

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

        {user?.geminiOptIn && (
          <BentoCard>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles size={16} className="text-accent-400" />
              <span className="text-sm text-zen-400">AI Advisor</span>
            </div>
            {aiAdvice ? (
              <div className="space-y-2">
                <p className="text-sm text-zen-200 whitespace-pre-line leading-relaxed">{aiAdvice.advice}</p>
                <p className="text-[10px] text-zen-600 mt-2">
                  {aiAdvice.cached ? 'Cached' : 'Fresh'} — {new Date(aiAdvice.generatedAt).toLocaleString()}
                </p>
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
        )}
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
      {stats && (
        <BentoGrid>
          <BentoCard>
            <p className="text-xs text-zen-500">Total Tracked</p>
            <p className="text-2xl font-bold text-zen-100 mt-1">{formatMinutes(stats.totalStandingSeconds || 0)} min</p>
          </BentoCard>
          <BentoCard>
            <p className="text-xs text-zen-500">Active Days</p>
            <p className="text-2xl font-bold text-zen-100 mt-1">{stats.totalDays || 0}</p>
          </BentoCard>
          <BentoCard>
            <p className="text-xs text-zen-500">Avg / Active Day</p>
            <p className="text-2xl font-bold text-zen-100 mt-1">
              {stats.totalDays ? formatMinutes(Math.round((stats.totalStandingSeconds || 0) / stats.totalDays)) : 0} min
            </p>
          </BentoCard>
        </BentoGrid>
      )}
    </div>
  );
}
