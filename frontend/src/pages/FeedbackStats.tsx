import { useState, useEffect } from 'react'
import { BarChart3, ThumbsUp, ThumbsDown, AlertTriangle, Folder } from 'lucide-react'
import api from '../api/client'

interface FeedbackStats {
  total: number
  helpful_count: number
  not_helpful_count: number
  helpful_rate: number
  by_severity: Record<string, { helpful: number; not_helpful: number }>
  by_folder: Record<string, { helpful: number; not_helpful: number }>
}

export default function FeedbackStats() {
  const [stats, setStats] = useState<FeedbackStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      const data = await api.get<FeedbackStats>('/alerts/feedback/stats')
      setStats(data)
      setError(null)
    } catch (err) {
      setError('Failed to load feedback statistics')
    } finally {
      setLoading(false)
    }
  }

  const severityColors: Record<string, string> = {
    critical: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',
  }

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        Loading statistics...
      </div>
    )
  }

  if (error) {
    return <div className="error-state">{error}</div>
  }

  if (!stats) return null

  return (
    <div>
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 className="page-title">
          <BarChart3 size={28} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
          AI Diagnosis Feedback
        </h1>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text-primary)' }}>{stats.total}</div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>Total Feedback</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--success)' }}>{stats.helpful_count}</div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            <ThumbsUp size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
            Helpful
          </div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--error)' }}>{stats.not_helpful_count}</div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            <ThumbsDown size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
            Not Helpful
          </div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ 
            fontSize: '32px', 
            fontWeight: 700, 
            color: stats.helpful_rate >= 70 ? 'var(--success)' : stats.helpful_rate >= 40 ? 'var(--warning)' : 'var(--error)' 
          }}>
            {stats.helpful_rate}%
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>Helpfulness Rate</div>
        </div>
      </div>

      {/* Helpfulness bar */}
      {stats.total > 0 && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>Overall Helpfulness</h3>
          <div style={{ 
            height: '24px', 
            borderRadius: '12px', 
            backgroundColor: 'var(--bg-tertiary)', 
            overflow: 'hidden',
            display: 'flex'
          }}>
            <div style={{ 
              width: `${stats.helpful_rate}%`, 
              backgroundColor: 'var(--success)',
              transition: 'width 0.5s ease',
            }} />
            <div style={{ 
              width: `${100 - stats.helpful_rate}%`, 
              backgroundColor: 'var(--error)',
              transition: 'width 0.5s ease',
            }} />
          </div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            marginTop: '8px', 
            fontSize: '12px', 
            color: 'var(--text-muted)' 
          }}>
            <span>{stats.helpful_count} helpful</span>
            <span>{stats.not_helpful_count} not helpful</span>
          </div>
        </div>
      )}

      {/* Breakdown by severity */}
      {Object.keys(stats.by_severity).length > 0 && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} />
            By Severity
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {Object.entries(stats.by_severity).map(([severity, counts]) => {
              const total = counts.helpful + counts.not_helpful
              const rate = total > 0 ? Math.round(counts.helpful / total * 100) : 0
              const color = severityColors[severity] || 'var(--text-muted)'
              return (
                <div key={severity}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginBottom: '6px'
                  }}>
                    <span style={{ 
                      fontSize: '13px', 
                      fontWeight: 600,
                      color: color
                    }}>
                      {severity}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {counts.helpful}/{total} helpful ({rate}%)
                    </span>
                  </div>
                  <div style={{ 
                    height: '8px', 
                    borderRadius: '4px', 
                    backgroundColor: 'var(--bg-tertiary)', 
                    overflow: 'hidden'
                  }}>
                    <div style={{ 
                      width: `${rate}%`, 
                      backgroundColor: color,
                      borderRadius: '4px',
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Breakdown by folder */}
      {Object.keys(stats.by_folder).length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Folder size={16} />
            By Folder
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {Object.entries(stats.by_folder).map(([folder, counts]) => {
              const total = counts.helpful + counts.not_helpful
              const rate = total > 0 ? Math.round(counts.helpful / total * 100) : 0
              return (
                <div key={folder}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginBottom: '6px'
                  }}>
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>
                      {folder}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {counts.helpful}/{total} helpful ({rate}%)
                    </span>
                  </div>
                  <div style={{ 
                    height: '8px', 
                    borderRadius: '4px', 
                    backgroundColor: 'var(--bg-tertiary)', 
                    overflow: 'hidden'
                  }}>
                    <div style={{ 
                      width: `${rate}%`, 
                      backgroundColor: rate >= 70 ? 'var(--success)' : rate >= 40 ? 'var(--warning)' : 'var(--error)',
                      borderRadius: '4px',
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {stats.total === 0 && (
        <div className="empty-state">
          <BarChart3 size={48} style={{ marginBottom: '16px', color: 'var(--text-muted)' }} />
          <p>No feedback yet. Users can rate AI diagnoses using 👍/👎 on alert cards.</p>
        </div>
      )}
    </div>
  )
}
