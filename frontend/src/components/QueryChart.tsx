import { useMemo } from 'react'

interface DataPoint {
  0: number  // timestamp
  1: number  // value
}

interface Series {
  metric: Record<string, string>
  values: DataPoint[]
}

interface QueryChartProps {
  series: Series[]
  loading?: boolean
  error?: string | null
  height?: number
}

export default function QueryChart({ series, loading, error, height = 280 }: QueryChartProps) {
  const padding = { top: 10, right: 10, bottom: 40, left: 50 }
  const chartWidth = 800
  const chartHeight = height
  const width = chartWidth - padding.left - padding.right
  const innerHeight = chartHeight - padding.top - padding.bottom

  const { paths, xLabels, yLabels } = useMemo(() => {
    if (!series || series.length === 0 || series.every((s) => s.values.length === 0)) {
      return { paths: [], xLabels: [], yLabels: [] }
    }

    // Collect all values
    const allValues: number[] = []
    const allTimestamps: number[] = []
    series.forEach((s) => {
      s.values.forEach((v) => {
        allTimestamps.push(v[0])
        const val = typeof v[1] === 'number' ? v[1] : parseFloat(v[1])
        if (!isNaN(val)) allValues.push(val)
      })
    })

    if (allValues.length === 0) {
      return { paths: [], xLabels: [], yLabels: [] }
    }

    const minTs = Math.min(...allTimestamps)
    const maxTs = Math.max(...allTimestamps)
    let minV = Math.min(...allValues)
    let maxV = Math.max(...allValues)

    // Add some padding to y range
    const range = maxV - minV || 1
    minV -= range * 0.05
    maxV += range * 0.05
    if (minV === maxV) {
      minV -= 0.5
      maxV += 0.5
    }

    const colors = ['#4f46e5', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899']

    const chartPaths = series
      .filter((s) => s.values.length > 0)
      .map((s, idx) => {
        const points = s.values
          .filter((v) => !isNaN(typeof v[1] === 'number' ? v[1] : parseFloat(v[1])))
          .map((v) => {
            const x = ((v[0] - minTs) / (maxTs - minTs)) * width + padding.left
            const val = typeof v[1] === 'number' ? v[1] : parseFloat(v[1])
            const y = padding.top + innerHeight - ((val - minV) / (maxV - minV)) * innerHeight
            return `${x},${y}`
          })
          .join(' ')

        return {
          d: `M ${points}`,
          color: colors[idx % colors.length],
          name: Object.entries(s.metric)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ') || `Series ${idx + 1}`,
        }
      })

    // X labels (time) - 5 labels
    const xL: { x: number; label: string }[] = []
    for (let i = 0; i <= 4; i++) {
      const ts = minTs + ((maxTs - minTs) * i) / 4
      const x = padding.left + (width * i) / 4
      const date = new Date(ts * 1000)
      xL.push({
        x,
        label: `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`,
      })
    }

    // Y labels - 5 labels
    const yL: { y: number; label: string }[] = []
    for (let i = 0; i <= 4; i++) {
      const val = minV + ((maxV - minV) * (4 - i)) / 4
      const y = padding.top + (innerHeight * i) / 4
      yL.push({
        y,
        label: val.toFixed(2),
      })
    }

    return { paths: chartPaths, xLabels: xL, yLabels: yL }
  }, [series, width, innerHeight])

  if (loading) {
    return (
      <div style={{ height: chartHeight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        <div className="spinner" style={{ width: 24, height: 24, marginRight: 12 }} />
        Loading chart...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ height: chartHeight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--error)' }}>
        Chart error: {error}
      </div>
    )
  }

  if (paths.length === 0) {
    return (
      <div style={{ height: chartHeight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        No data to display
      </div>
    )
  }

  return (
    <div>
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} style={{ width: '100%', height: 'auto' }}>
        {/* Grid lines - horizontal */}
        {yLabels.map((l, i) => (
          <g key={`hgrid-${i}`}>
            <line
              x1={padding.left}
              y1={l.y}
              x2={padding.left + width}
              y2={l.y}
              stroke="var(--border-color)"
              strokeWidth={0.5}
              strokeDasharray="4,4"
            />
          </g>
        ))}

        {/* Grid lines - vertical */}
        {xLabels.map((l, i) => (
          <g key={`vgrid-${i}`}>
            <line
              x1={l.x}
              y1={padding.top}
              x2={l.x}
              y2={padding.top + innerHeight}
              stroke="var(--border-color)"
              strokeWidth={0.5}
              strokeDasharray="4,4"
            />
          </g>
        ))}

        {/* Y axis labels */}
        {yLabels.map((l, i) => (
          <text
            key={`ylabel-${i}`}
            x={padding.left - 8}
            y={l.y + 4}
            textAnchor="end"
            fill="var(--text-muted)"
            fontSize="11"
          >
            {l.label}
          </text>
        ))}

        {/* X axis labels */}
        {xLabels.map((l, i) => (
          <text
            key={`xlabel-${i}`}
            x={l.x}
            y={chartHeight - 10}
            textAnchor="middle"
            fill="var(--text-muted)"
            fontSize="11"
          >
            {l.label}
          </text>
        ))}

        {/* Data paths */}
        {paths.map((p, i) => (
          <g key={`path-${i}`}>
            <path
              d={p.d}
              fill="none"
              stroke={p.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* Legend */}
            <g transform={`translate(${padding.left + 10 + i * 140}, ${padding.top - 2})`}>
              <rect x={0} y={-8} width={12} height={3} rx={1} fill={p.color} />
              <text x={18} y={-4} fill="var(--text-secondary)" fontSize="11">
                {p.name.length > 25 ? p.name.slice(0, 25) + '...' : p.name}
              </text>
            </g>
          </g>
        ))}
      </svg>
    </div>
  )
}