import { useState, useEffect } from 'react'
import { Bell, CheckCircle, Loader, AlertCircle, Eye } from 'lucide-react'
import api from '../api/client'

interface Alert {
  id: string
  alertname: string
  status: string
  severity: string
  summary: string
  description: string
  labels: Record<string, string>
  starts_at: string
  diagnosis: string | null
  diagnosis_status: string
}

export default function ActiveAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadAlerts()
    const interval = setInterval(loadAlerts, 5000)
    return () => clearInterval(interval)
  }, [])

  const loadAlerts = async () => {
    try {
      const data = await api.get<Alert[]>('/alerts')
      setAlerts(data)
      setError(null)
    } catch (err) {
      setError('Failed to load alerts')
    } finally {
      setLoading(false)
    }
  }

  const resolveAlert = async (id: string) => {
    try {
      await api.post(`/alerts/${id}/resolve`, {})
      loadAlerts()
    } catch (err) {
      console.error('Failed to resolve alert:', err)
    }
  }

  const getStatusBadge = (status: string) => {
    if (status === 'acknowledged') {
      return (
        <span className="badge" style={{ 
          background: 'rgba(34,197,94,0.2)', 
          color: 'var(--success)',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}>
          <Eye size={10} />
          Acknowledged
        </span>
      )
    }
    return null
  }

  const getSeverityClass = (severity: string) => {
    switch (severity) {
      case 'critical': return 'critical'
      case 'warning': return 'warning'
      default: return 'info'
    }
  }

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return 'badge-critical'
      case 'warning': return 'badge-warning'
      default: return 'badge-info'
    }
  }

  if (loading && alerts.length === 0) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        Loading alerts...
      </div>
    )
  }

  if (error) {
    return <div className="error-state">{error}</div>
  }

  return (
    <div>
      <div className="header">
        <h1 className="page-title">
          <Bell size={28} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
          Active Alerts
        </h1>
        <span style={{ color: 'var(--text-secondary)' }}>
          {alerts.length} active
        </span>
      </div>

      {alerts.length === 0 ? (
        <div className="empty-state">
          <CheckCircle size={48} style={{ marginBottom: '16px', color: 'var(--success)' }} />
          <p>No active alerts. Everything looks good!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {alerts.map(alert => (
            <div key={alert.id} className={`alert-card ${getSeverityClass(alert.severity)}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 600 }}>{alert.alertname}</h3>
                    <span className={`badge ${getSeverityBadge(alert.severity)}`}>
                      {alert.severity}
                    </span>
                    {getStatusBadge(alert.status)}
                    {alert.diagnosis_status === 'analyzing' && (
                      <span className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Loader size={12} className="spinner" />
                        Analyzing...
                      </span>
                    )}
                  </div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                    {alert.summary || alert.description}
                  </p>
                </div>
                {alert.status !== 'acknowledged' && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => resolveAlert(alert.id)}
                    title="Acknowledge alert"
                  >
                    <CheckCircle size={16} />
                  </button>
                )}
              </div>

              <div style={{ 
                display: 'flex', 
                gap: '8px', 
                marginBottom: '8px',
                fontSize: '12px',
                color: 'var(--text-muted)'
              }}>
                {Object.entries(alert.labels).map(([key, value]) => (
                  <span key={key} style={{ 
                    backgroundColor: 'var(--bg-tertiary)',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-sm)'
                  }}>
                    {key}={value}
                  </span>
                ))}
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                Started: {new Date(alert.starts_at).toLocaleString()}
              </div>

              {alert.diagnosis ? (
                <div style={{ 
                  backgroundColor: 'var(--bg-tertiary)',
                  padding: '12px',
                  borderRadius: 'var(--radius-sm)',
                  borderLeft: '3px solid var(--accent-primary)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <AlertCircle size={14} color="var(--accent-primary)" />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-primary)' }}>
                      AI Diagnosis
                    </span>
                  </div>
                  <p style={{ fontSize: '13px', lineHeight: '1.5' }}>{alert.diagnosis}</p>
                </div>
              ) : alert.diagnosis_status === 'pending' ? (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  color: 'var(--text-secondary)',
                  fontSize: '13px'
                }}>
                  <span className="status-dot status-pending" />
                  Waiting for diagnosis...
                </div>
              ) : alert.diagnosis_status === 'failed' ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                  Diagnosis unavailable
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}