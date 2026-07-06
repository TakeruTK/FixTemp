interface GaugeProps { value: number; label: string; tone?: 'cyan' | 'lime' | 'amber'; size?: 'large' | 'small' }

export function Gauge({ value, label, tone = 'cyan', size = 'large' }: GaugeProps) {
  const safe = Math.min(100, Math.max(0, value || 0))
  const radius = 54
  const circumference = 2 * Math.PI * radius
  return (
    <div className={`gauge gauge--${size}`}>
      <svg viewBox="0 0 132 132" aria-label={`${label}: ${safe}%`}>
        <circle className="gauge__track" cx="66" cy="66" r={radius} />
        <circle className={`gauge__value gauge__value--${tone}`} cx="66" cy="66" r={radius}
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - safe / 100)} />
      </svg>
      <div className="gauge__text"><strong>{Math.round(safe)}<small>%</small></strong><span>{label}</span></div>
    </div>
  )
}
