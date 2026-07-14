import type { ReactNode } from 'react'
import { useI18n } from '../i18n'
import { Gauge } from './Gauge'
import { Sparkline } from './Sparkline'

interface MetricCardProps {
  title: string; subtitle: string; value: number; tone?: 'cyan' | 'lime' | 'amber'; history: number[]
  stats: { label: string; value: ReactNode; progress?: number | null }[]; badge?: string; action?: ReactNode
}

const copy = {
  es: { load: 'Carga', last2m: 'Últimos 2 min' },
  en: { load: 'Load', last2m: 'Last 2 min' },
  'zh-CN': { load: '负载', last2m: '最近 2 分钟' }
} as const

export function MetricCard({ title, subtitle, value, tone = 'cyan', history, stats, badge, action }: MetricCardProps) {
  const { language } = useI18n()
  const text = copy[language]
  const color = tone === 'lime' ? '#b9f65c' : tone === 'amber' ? '#ffb45e' : '#42e6f5'

  return (
    <section className={`metric-card metric-card--${tone}`}>
      <div className="card-heading"><div><p className="eyebrow">{subtitle}</p><h2>{title}</h2></div><div className="card-actions">{action}{badge && <span className="chip">{badge}</span>}</div></div>
      <div className="metric-card__main">
        <Gauge value={value} label={text.load} tone={tone} />
        <div className="metric-stats">{stats.map((stat) => <div className={`stat ${stat.progress !== undefined ? 'stat--bar' : ''}`} key={stat.label}>
          {stat.progress !== undefined ? <div className="stat-bar"><i style={{ width: `${Math.max(0, Math.min(100, stat.progress ?? 0))}%` }}/></div> : null}
          <div className="stat-row"><span>{stat.label}</span><strong>{stat.value}</strong></div>
        </div>)}</div>
      </div>
      <div className="metric-card__chart"><Sparkline values={history} color={color}/><span>{text.last2m}</span></div>
    </section>
  )
}
