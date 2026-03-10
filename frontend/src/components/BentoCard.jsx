export function BentoCard({ children, className = '', pulse = false, ...props }) {
  return (
    <div
      className={`bento-card ${pulse ? 'bento-pulse' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function BentoGrid({ children, className = '' }) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({ label, value, sub, icon: Icon }) {
  return (
    <BentoCard className="flex items-start gap-4">
      {Icon && (
        <div className="w-10 h-10 rounded-xl bg-accent-500/10 flex items-center justify-center shrink-0">
          <Icon size={18} className="text-accent-400" />
        </div>
      )}
      <div>
        <p className="text-xs text-zen-500 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-zen-100 mt-1">{value}</p>
        {sub && <p className="text-xs text-zen-400 mt-1">{sub}</p>}
      </div>
    </BentoCard>
  );
}
