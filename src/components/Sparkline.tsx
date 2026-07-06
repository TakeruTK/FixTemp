interface SparklineProps { values: number[]; color?: string; height?: number }

export function Sparkline({ values, color = '#42e6f5', height = 54 }: SparklineProps) {
  const data = values.length > 1 ? values : [0, 0]
  const width = 260
  const points = data.map((value, index) => `${(index / (data.length - 1)) * width},${height - (Math.max(0, Math.min(100, value)) / 100) * (height - 8) - 4}`).join(' ')
  const area = `0,${height} ${points} ${width},${height}`
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".22"/><stop offset="1" stopColor={color} stopOpacity="0"/></linearGradient></defs>
      <polyline points={area} fill={`url(#grad-${color.replace('#', '')})`} stroke="none" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
