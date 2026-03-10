import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import useToastStore from '../stores/useToastStore';

const ICONS = {
  success: CheckCircle,
  error: XCircle,
  warn: AlertTriangle,
  info: Info,
};

const COLORS = {
  success: 'border-accent-500/50 bg-accent-500/10',
  error: 'border-danger-500/50 bg-danger-500/10',
  warn: 'border-warn-500/50 bg-warn-500/10',
  info: 'border-info-500/50 bg-info-500/10',
};

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const remove = useToastStore((s) => s.remove);

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => {
        const Icon = ICONS[t.type] || Info;
        return (
          <div
            key={t.id}
            className={`flex items-start gap-3 p-4 rounded-xl border backdrop-blur-xl ${COLORS[t.type] || COLORS.info}`}
            style={{ animation: 'toast-in 0.3s ease-out' }}
          >
            <Icon size={18} className="mt-0.5 shrink-0" />
            <span className="text-sm text-zen-100 flex-1">{t.message}</span>
            <button onClick={() => remove(t.id)} className="text-zen-500 hover:text-zen-200">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
