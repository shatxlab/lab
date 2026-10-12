import { useRef, useState, type KeyboardEvent } from 'react'
import { compactMoney, monthLabel, monthTicks, nearestIndex, niceTicks } from '@/lib/tycoon/chartMath'
import { formatMoney } from '@/lib/tycoon/format'
import { useWidth } from './useWidth'
import { cssVars } from './style'

export interface Series {
  id: string
  name: string
  /** A CSS custom property holding the series colour, e.g. `--series-1`. */
  color: string
  values: number[]
}

interface LineChartProps {
  title: string
  description: string
  /** One day per point, ascending. */
  days: number[]
  series: Series[]
  /** Washes the area under a single series; ignored with more than one. */
  area?: boolean
}

const HEIGHT = 188
const MARGIN = { top: 12, right: 62, bottom: 26, left: 50 }
/** Two end labels closer than this would overlap, so the second is left to the legend and tooltip. */
const LABEL_GAP = 14

/**
 * A line chart on one y axis. One series needs no legend (the title names it); two or more get one.
 * Hover or arrow-key to read any month: a crosshair snaps to the nearest point and one tooltip lists every series.
 */
export function LineChart({ title, description, days, series, area = false }: LineChartProps) {
  const frame = useRef<HTMLDivElement>(null)
  const width = useWidth(frame)
  const [active, setActive] = useState<number | null>(null)

  const plotW = Math.max(width - MARGIN.left - MARGIN.right, 40)
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom
  const all = series.flatMap((s) => s.values)
  const { ticks, lo, hi } = niceTicks(Math.min(0, ...all), Math.max(0, ...all))
  const firstDay = days[0]
  const lastDay = days[days.length - 1]

  const x = (day: number) => MARGIN.left + ((day - firstDay) / (lastDay - firstDay || 1)) * plotW
  const y = (value: number) => MARGIN.top + (1 - (value - lo) / (hi - lo)) * plotH
  const path = (values: number[]) => values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(days[i]).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')

  const move = (clientX: number) => {
    const box = frame.current?.getBoundingClientRect()
    if (!box) return
    const day = firstDay + ((clientX - box.left - MARGIN.left) / plotW) * (lastDay - firstDay)
    setActive(nearestIndex(days, day))
  }
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = days.length - 1
    const current = active ?? last
    const next = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: last }[event.key]
    if (next === undefined) return
    event.preventDefault()
    setActive(Math.max(0, Math.min(last, next)))
  }

  // End labels: the latest value of each series, skipping any that would sit on top of another.
  const endLabels = series
    .map((s) => ({ id: s.id, y: y(s.values[s.values.length - 1]), text: compactMoney(s.values[s.values.length - 1]) }))
    .reduce<{ id: string; y: number; text: string }[]>(
      (kept, label) => (kept.every((k) => Math.abs(k.y - label.y) >= LABEL_GAP) ? [...kept, label] : kept),
      [],
    )

  const xTicks = monthTicks(firstDay, lastDay)
  const baseline = y(Math.max(lo, Math.min(0, hi)))
  const showArea = area && series.length === 1
  const latest = series.map((s) => `${s.name} ${formatMoney(s.values[s.values.length - 1])}`).join(', ')

  const tipLeft = active === null ? 0 : x(days[active])
  const tipOnLeft = tipLeft > width * 0.55

  return (
    <figure className="viz">
      <figcaption>
        <h3>{title}</h3>
        <p className="muted">{description}</p>
      </figcaption>

      {series.length > 1 && (
        <ul className="legend">
          {series.map((s) => (
            <li key={s.id}>
              <span className="key" style={cssVars({ background: `var(${s.color})` })} />
              {s.name}
            </li>
          ))}
        </ul>
      )}

      <div
        className="viz-frame"
        ref={frame}
        tabIndex={0}
        role="group"
        aria-label={`${title}. Use the left and right arrow keys to read each month.`}
        onKeyDown={onKey}
        onFocus={() => setActive((a) => a ?? days.length - 1)}
        onBlur={() => setActive(null)}
        onPointerMove={(e) => move(e.clientX)}
        onPointerLeave={() => setActive(null)}
      >
        <svg width={width} height={HEIGHT} role="img" aria-label={`${title}: latest ${latest}`}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line className={tick === 0 && lo < 0 ? 'axis' : 'grid'} x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} />
              <text className="tick" x={MARGIN.left - 8} y={y(tick) + 4} textAnchor="end">
                {compactMoney(tick)}
              </text>
            </g>
          ))}
          <line className="axis" x1={MARGIN.left} x2={width - MARGIN.right} y1={baseline} y2={baseline} />

          {xTicks.map((day) => (
            <text key={day} className="tick" x={x(day)} y={HEIGHT - 8} textAnchor="middle">
              {monthLabel(day)}
            </text>
          ))}

          {showArea && (
            <path
              className="area"
              style={cssVars({ fill: `var(${series[0].color})` })}
              d={`${path(series[0].values)} L${x(lastDay).toFixed(1)} ${baseline.toFixed(1)} L${x(firstDay).toFixed(1)} ${baseline.toFixed(1)} Z`}
            />
          )}
          {series.map((s) => (
            <path key={s.id} className="line" style={cssVars({ stroke: `var(${s.color})` })} d={path(s.values)} />
          ))}

          {series.map((s) => (
            <circle
              key={s.id}
              className="dot"
              style={cssVars({ fill: `var(${s.color})` })}
              cx={x(lastDay)}
              cy={y(s.values[s.values.length - 1])}
              r={4}
            />
          ))}
          {endLabels.map((label) => (
            <text key={label.id} className="end-label" x={x(lastDay) + 10} y={label.y + 4}>
              {label.text}
            </text>
          ))}

          {active !== null && (
            <g>
              <line className="crosshair" x1={x(days[active])} x2={x(days[active])} y1={MARGIN.top} y2={MARGIN.top + plotH} />
              {series.map((s) => (
                <circle
                  key={s.id}
                  className="dot"
                  style={cssVars({ fill: `var(${s.color})` })}
                  cx={x(days[active])}
                  cy={y(s.values[active])}
                  r={4}
                />
              ))}
            </g>
          )}
        </svg>

        {active !== null && (
          <div
            className="tooltip"
            style={{
              top: MARGIN.top,
              ...(tipOnLeft ? { right: width - tipLeft + 12 } : { left: tipLeft + 12 }),
            }}
          >
            <div className="tooltip-date">{monthLabel(days[active])}</div>
            {series.map((s) => (
              <div key={s.id} className="tooltip-row">
                <span className="key" style={cssVars({ background: `var(${s.color})` })} />
                <strong>{formatMoney(s.values[active])}</strong>
                <span>{s.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </figure>
  )
}
