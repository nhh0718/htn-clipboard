import { useState, useEffect } from 'react'
import { useTranslation } from '../lib/i18n'
import { GetAnalytics } from '../services/wails-bridge'
import type { AnalyticsData } from '../types/clipboard'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Clipboard, FileText, Image, Pin, CalendarDays, TrendingUp, RefreshCw } from 'lucide-react'

const COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6', '#f97316']
const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981']

export function AnalyticsDashboard() {
  const t = useTranslation()
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadData() {
    setLoading(true)
    try {
      const result = await GetAnalytics()
      setData(result)
    } catch (err) {
      console.error('[analytics] load error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        {t('loading')}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full w-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <TrendingUp size={14} />
          {t('analytics_title')}
        </h2>
        <button
          onClick={loadData}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title={t('analytics_refresh')}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4 space-y-4">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-2">
          <StatCard icon={<Clipboard size={14} />} label={t('analytics_total')} value={data.totalItems} color="text-blue-400" />
          <StatCard icon={<CalendarDays size={14} />} label={t('analytics_today')} value={data.todayCount} color="text-emerald-400" />
          <StatCard icon={<FileText size={14} />} label={t('analytics_text')} value={data.totalText} color="text-violet-400" />
          <StatCard icon={<Image size={14} />} label={t('analytics_images')} value={data.totalImages} color="text-cyan-400" />
          <StatCard icon={<Pin size={14} />} label={t('analytics_pinned')} value={data.totalPinned} color="text-amber-400" />
          <StatCard icon={<TrendingUp size={14} />} label={t('analytics_week')} value={data.weekCount} color="text-pink-400" />
        </div>

        {/* Daily Activity Chart */}
        {data.dailyCounts.length > 0 && (
          <ChartSection title={t('analytics_daily_activity')}>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={data.dailyCounts} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="date" tick={{ fontSize: 9 }} stroke="var(--muted-foreground)"
                  tickFormatter={(v: string) => v.slice(5)}
                />
                <YAxis tick={{ fontSize: 9 }} stroke="var(--muted-foreground)" />
                <Tooltip
                  contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                  labelStyle={{ color: 'var(--foreground)' }}
                />
                <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="url(#colorCount)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartSection>
        )}

        {/* Top Source Apps */}
        {data.topSourceApps.length > 0 && (
          <ChartSection title={t('analytics_top_apps')}>
            <ResponsiveContainer width="100%" height={Math.max(120, data.topSourceApps.length * 28)}>
              <BarChart data={data.topSourceApps} layout="vertical" margin={{ top: 0, right: 5, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9 }} stroke="var(--muted-foreground)" />
                <YAxis
                  type="category" dataKey="app" tick={{ fontSize: 9 }} stroke="var(--muted-foreground)"
                  width={80} tickFormatter={(v: string) => v.length > 12 ? v.slice(0, 12) + '…' : v}
                />
                <Tooltip
                  contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {data.topSourceApps.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartSection>
        )}

        {/* Type Distribution + Hourly side by side */}
        <div className="grid grid-cols-2 gap-2">
          {/* Type Pie */}
          {data.typeDistribution.length > 0 && (
            <ChartSection title={t('analytics_types')}>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie
                    data={data.typeDistribution}
                    dataKey="count" nameKey="type"
                    cx="50%" cy="50%"
                    innerRadius={30} outerRadius={50}
                    strokeWidth={0}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    label={(props: any) =>
                      `${props.type} ${((props.percent ?? 0) * 100).toFixed(0)}%`
                    }
                  >
                    {data.typeDistribution.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartSection>
          )}

          {/* Hourly Heatmap Bar */}
          {data.hourlyCounts.length > 0 && (
            <ChartSection title={t('analytics_hourly')}>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={fillHours(data.hourlyCounts)} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                  <XAxis
                    dataKey="hour" tick={{ fontSize: 8 }} stroke="var(--muted-foreground)"
                    tickFormatter={(v: number) => v % 4 === 0 ? `${v}h` : ''}
                  />
                  <YAxis tick={{ fontSize: 8 }} stroke="var(--muted-foreground)" />
                  <Tooltip
                    contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                    labelFormatter={(v) => `${v}:00`}
                  />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartSection>
          )}
        </div>
      </div>
    </div>
  )
}

// Fill missing hours 0-23 with count 0
function fillHours(data: { hour: number; count: number }[]): { hour: number; count: number }[] {
  const map = new Map(data.map(d => [d.hour, d.count]))
  return Array.from({ length: 24 }, (_, i) => ({ hour: i, count: map.get(i) ?? 0 }))
}

// --- Sub-components ---

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1">
      <div className={`flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider ${color}`}>
        {icon}
        {label}
      </div>
      <p className="text-xl font-bold text-foreground">{value.toLocaleString()}</p>
    </div>
  )
}

function ChartSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{title}</p>
      {children}
    </div>
  )
}
