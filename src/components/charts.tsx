import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card } from './ui'
import type { ReactNode } from 'react'

export const PALETTE = ['#2f4a3a', '#8aa58f', '#b8923f', '#6b7f9c', '#a8402f', '#7a6a8a', '#4f8a8b', '#c97b4a', '#9aa17a', '#8a8478']
const axis = { stroke: 'var(--muted)', fontSize: 11 }
const tip = { contentStyle: { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--ink)', fontSize: 12 } }

export function ChartCard({ title, children, note, height = 220 }: { title: string; children: ReactNode; note?: ReactNode; height?: number }) {
  return (
    <Card>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <div style={{ height }} role="img" aria-label={title}>
        {children}
      </div>
      {note && <p className="mt-2 text-xs text-muted">{note}</p>}
    </Card>
  )
}

export function Bars({ data, x, keys, unit, stacked }: { data: any[]; x: string; keys: { key: string; label: string; color?: string }[]; unit?: string; stacked?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ left: -18, right: 4, top: 4 }}>
        <CartesianGrid stroke="var(--line)" vertical={false} />
        <XAxis dataKey={x} {...axis} tickLine={false} />
        <YAxis {...axis} tickLine={false} axisLine={false} />
        <Tooltip {...tip} formatter={(v: any) => (unit ? `${v} ${unit}` : v)} />
        {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {keys.map((k, i) => (
          <Bar key={k.key} dataKey={k.key} name={k.label} fill={k.color ?? PALETTE[i]} radius={[4, 4, 0, 0]} stackId={stacked ? 's' : undefined} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

export function Lines({ data, x, keys, domain, unit }: { data: any[]; x: string; keys: { key: string; label: string; color?: string }[]; domain?: [number | 'auto', number | 'auto']; unit?: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ left: -18, right: 8, top: 4 }}>
        <CartesianGrid stroke="var(--line)" vertical={false} />
        <XAxis dataKey={x} {...axis} tickLine={false} />
        <YAxis {...axis} tickLine={false} axisLine={false} domain={domain ?? ['auto', 'auto']} />
        <Tooltip {...tip} formatter={(v: any) => (unit ? `${v} ${unit}` : v)} />
        {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {keys.map((k, i) => (
          <Line key={k.key} type="monotone" dataKey={k.key} name={k.label} stroke={k.color ?? PALETTE[i]} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

export function Donut({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="var(--surface)">
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip {...tip} formatter={(v: any) => `${Number(v).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}`} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}
