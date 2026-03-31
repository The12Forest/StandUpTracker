import { useState } from 'react';
import { AlertTriangle, Clock, X, Trash2, Check } from 'lucide-react';
import useToastStore from '../stores/useToastStore';

function formatDateTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDuration(ms) {
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function ForgottenCheckoutModal({ forgotten, onFinalize, onDiscard, onClose }) {
  const toast = useToastStore();
  const [saving, setSaving] = useState(false);

  // Compute a sensible default end time: startedAt + thresholdHours or end of start day, whichever is earlier
  const startedAt = forgotten.startedAt;
  const thresholdMs = (forgotten.thresholdHours || 8) * 3600000;
  const startDay = new Date(startedAt).toISOString().slice(0, 10); // YYYY-MM-DD of start
  const endOfStartDay = new Date(startDay + 'T23:59:00').getTime();
  const defaultEnd = new Date(Math.min(startedAt + thresholdMs, endOfStartDay, Date.now()));

  // End time is locked to the same calendar day as start — only time is editable
  const [endTime, setEndTime] = useState(
    `${String(defaultEnd.getHours()).padStart(2, '0')}:${String(defaultEnd.getMinutes()).padStart(2, '0')}`
  );

  const correctedEnd = new Date(`${startDay}T${endTime}:00`);
  const isValid = !isNaN(correctedEnd.getTime()) && correctedEnd.getTime() > startedAt && correctedEnd.getTime() <= Date.now();
  const sessionDuration = isValid ? correctedEnd.getTime() - startedAt : 0;

  const handleFinalize = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      await onFinalize(correctedEnd.toISOString());
      toast.success('Forgotten checkout finalized');
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to finalize');
    }
    setSaving(false);
  };

  const handleDiscard = async () => {
    if (!confirm('Discard this session entirely? No time will be recorded.')) return;
    setSaving(true);
    try {
      await onDiscard();
      toast.success('Session discarded');
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to discard');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zen-900 border border-zen-700/40 rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zen-700/30">
          <div className="flex items-center gap-2 text-warn-400">
            <AlertTriangle size={20} />
            <h3 className="text-lg font-bold text-zen-100">Forgotten Checkout</h3>
          </div>
          <button onClick={onClose} className="text-zen-500 hover:text-zen-300 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-sm text-zen-400">
            Your timer has been running since <span className="text-zen-200 font-medium">{formatDateTime(startedAt)}</span> ({formatDuration(forgotten.elapsedMs)} ago). It looks like you forgot to check out.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-zen-500 block mb-1">Timer started</label>
              <div className="text-sm text-zen-200 font-mono bg-zen-800/60 px-3 py-2 rounded-lg">
                {formatDateTime(startedAt)}
              </div>
            </div>

            <div>
              <label className="text-xs text-zen-500 block mb-1">When did you actually stop?</label>
              <div className="flex gap-2">
                <div className="glass-input text-sm flex-1 opacity-60 cursor-not-allowed" title="End time must be on the same day as start">
                  {startDay}
                </div>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="glass-input text-sm w-28"
                />
              </div>
              <p className="text-[10px] text-zen-600 mt-1">End time is restricted to the same day as the start.</p>
            </div>

            {isValid && (
              <div className="flex items-center gap-2 text-sm">
                <Clock size={14} className="text-accent-400" />
                <span className="text-zen-300">Session duration: <span className="text-zen-100 font-semibold">{formatDuration(sessionDuration)}</span></span>
              </div>
            )}

            {!isValid && endTime && (
              <p className="text-xs text-danger-400">End time must be after start time and not in the future.</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-zen-700/30">
          <button
            onClick={handleDiscard}
            disabled={saving}
            className="btn-ghost text-xs text-danger-400 flex items-center gap-1.5"
          >
            <Trash2 size={14} /> Discard Session
          </button>
          <button
            onClick={handleFinalize}
            disabled={saving || !isValid}
            className="btn-accent text-sm flex items-center gap-1.5 disabled:opacity-40"
          >
            <Check size={14} /> Save & Finalize
          </button>
        </div>
      </div>
    </div>
  );
}
