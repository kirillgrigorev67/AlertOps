import { useState, useEffect } from 'react'
import { Activity, CheckCircle, AlertTriangle, XCircle, Clock, Calendar, Zap, Server } from 'lucide-react'
import api from '../api/client'

interface StatusAlert {
  id: string
  alertname: string
  severity: string
  description: string
  starts_at: string
  diagnosis: string | null
}

interface FolderStatus {
  name: string
  status: 'operational' | 'degraded' | 'outage'
  alert_count: number
  max_severity: string | null
  alerts: StatusAlert[]
}

interface TimelineEvent {
  type: string
  alertname: string
  folder: string
  severity: string
  starts_at: string
  ends_at: string
  duration_seconds: number
}

interface Stats {
  total_incidents: number
  mttr_seconds: number
  severity_counts: Record<string, number>
  active_alert_count: number
}

interface Branding {
  title: string
  logo_url: string
  footer_text: string
}

interface StatusData {
  folders: FolderStatus[]
  timeline: TimelineEvent[]
  stats: Stats
  branding: Branding
}

const STATUS_CONFIG = {
  operational: { color: '#22c55e', bg: 'rgba(34,197,94,0.1)', label: 'Operational', icon: CheckCircle },
  degraded: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: 'Degraded Performance', icon: AlertTriangle },
  outage: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: 'Outage', icon: XCircle },
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

function formatDateTime(iso: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso.replace('Z', '+00:00'))
    return d.toLocaleString()
  } catch {
    return iso
  }
}

export default function StatusPage() {
  const [data, setData] = useState<StatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 5000)
    return () => clearInterval(interval)
  }, [])

  const loadData = async () => {
    try {
      const res = await api.get<StatusData>('/status')
      setData(res)
      setError(null)
    } catch {
      setError('Failed to load status page data')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
        <Zap size={32} color="#6366f1" />
        <div className="spinner" />
        Loading status...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
        <XCircle size={48} color="#ef4444" />
        <p style={{ color: '#e2e8f0', fontSize: '16px' }}>{error}</p>
      </div>
    )
  }

  if (!data) return null

  const { folders, timeline, stats, branding } = data

  // Overall system status
  const hasOutage = folders.some(f => f.status === 'outage')
  const hasDegraded = folders.some(f => f.status === 'degraded')
  const overallStatus = hasOutage ? 'outage' : hasDegraded ? 'degraded' : 'operational'
  const overallConfig = STATUS_CONFIG[overallStatus]

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0', fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif' }}>
      {/* Header */}
      <header style={{ borderBottom: '1px solid #1e293b', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {branding.logo_url ? (
            <img src={branding.logo_url} alt="Logo" style={{ height: '32px', borderRadius: '4px' }} />
          ) : (
            <Zap size={28} color="#6366f1" />
          )}
          <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>{branding.title}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: overallConfig.color, display: 'inline-block', boxShadow: `0 0 8px ${overallConfig.color}60` }} />
          <span style={{ fontSize: '14px', fontWeight: 600, color: overallConfig.color }}>{overallConfig.label}</span>
          <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '8px' }}>Last updated: {new Date().toLocaleTimeString()}</span>
        </div>
      </header>

      <main style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 16px' }}>
        {/* Stats Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
          <div style={{ background: '#1e293b', borderRadius: '8px', padding: '16px', border: '1px solid #334155' }}>
            <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Active Alerts</div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: stats.active_alert_count > 0 ? '#ef4444' : '#22c55e' }}>{stats.active_alert_count}</div>
          </div>
          <div style={{ background: '#1e293b', borderRadius: '8px', padding: '16px', border: '1px solid #334155' }}>
            <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Total Incidents</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{stats.total_incidents}</div>
          </div>
          <div style={{ background: '#1e293b', borderRadius: '8px', padding: '16px', border: '1px solid #334155' }}>
            <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>MTTR</div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#6366f1' }}>{formatDuration(stats.mttr_seconds)}</div>
          </div>
          <div style={{ background: '#1e293b', borderRadius: '8px', padding: '16px', border: '1px solid #334155' }}>
            <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Critical</div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#ef4444' }}>{stats.severity_counts.critical || 0}</div>
          </div>
        </div>

        {/* Folder Status */}
        <section style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Server size={16} /> Services
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {folders.map(folder => {
              const config = STATUS_CONFIG[folder.status]
              const Icon = config.icon
              return (
                <div key={folder.name} style={{ background: '#1e293b', borderRadius: '8px', padding: '16px', border: `1px solid ${config.color}30`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '200px' }}>
                    <Icon size={20} color={config.color} />
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 600 }}>{folder.name}</div>
                      <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                        {folder.alert_count > 0 ? `${folder.alert_count} alert${folder.alert_count > 1 ? 's' : ''}` : 'No active alerts'}
                        {folder.max_severity && ` · Severity: ${folder.max_severity}`}
                      </div>
                    </div>
                  </div>
                  <span style={{ background: config.bg, color: config.color, padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {config.label}
                  </span>
                </div>
              )
            })}
          </div>
        </section>

        {/* Active Alerts Detail */}
        {folders.some(f => f.alert_count > 0) && (
          <section style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={16} /> Active Alerts
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {folders.filter(f => f.alert_count > 0).flatMap(f =>
                f.alerts.map(a => (
                  <div key={a.id} style={{ background: '#1e293b', borderRadius: '8px', padding: '14px 16px', borderLeft: `3px solid ${STATUS_CONFIG[a.severity as keyof typeof STATUS_CONFIG]?.color || '#f59e0b'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ flex: 1, minWidth: '200px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>{a.alertname}</div>
                      <div style={{ fontSize: '13px', color: '#94a3b8' }}>{a.description}</div>
                      {a.diagnosis && (
                        <div style={{ marginTop: '8px', background: 'rgba(99,102,241,0.08)', padding: '8px 12px', borderRadius: '6px', borderLeft: '3px solid #6366f1' }}>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: '#818cf8', marginBottom: '2px' }}>AI Diagnosis</div>
                          <div style={{ fontSize: '12px', color: '#c7d2fe', lineHeight: '1.5' }}>{a.diagnosis}</div>
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={12} /> {formatDateTime(a.starts_at)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {/* Incident Timeline */}
        <section>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={16} /> Incident History
          </h2>
          {timeline.length === 0 ? (
            <div style={{ background: '#1e293b', borderRadius: '8px', padding: '24px', textAlign: 'center', color: '#64748b' }}>
              No incidents recorded yet
            </div>
          ) : (
            <div style={{ position: 'relative', paddingLeft: '24px', borderLeft: '2px solid #334155' }}>
              {timeline.map((evt, i) => (
                <div key={i} style={{ position: 'relative', marginBottom: '16px' }}>
                  <div style={{ position: 'absolute', left: '-29px', top: '4px', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: STATUS_CONFIG[evt.severity as keyof typeof STATUS_CONFIG]?.color || '#64748b', border: '2px solid #0f172a' }} />
                  <div style={{ background: '#1e293b', borderRadius: '8px', padding: '12px 16px', border: '1px solid #334155' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <span style={{ fontSize: '14px', fontWeight: 600 }}>{evt.alertname}</span>
                        <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '8px' }}>[{evt.folder}]</span>
                      </div>
                      <span style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={12} /> Resolved in {formatDuration(evt.duration_seconds)}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                      {formatDateTime(evt.starts_at)} → {formatDateTime(evt.ends_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #1e293b', padding: '16px 24px', textAlign: 'center', fontSize: '12px', color: '#64748b' }}>
        {branding.footer_text} · Last check: {new Date().toLocaleTimeString()}
      </footer>
    </div>
  )
}
