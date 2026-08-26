import { useState, useEffect } from 'react'
import { History, Search, AlertCircle, Trash2, Folder, VolumeX } from 'lucide-react'
import api from '../api/client'
import ConfirmModal from '../components/ConfirmModal'

interface Alert {
  id: string
  alertname: string
  status: string
  severity: string
  description: string
  labels: Record<string, string>
  starts_at: string
  ends_at: string | null
  diagnosis: string | null
  folder?: string | null
  resolution_reason?: string | null
  silenced_by?: string | null
  silenced_at?: string | null
}

interface FolderInfo {
  name: string
  silenced_until?: string | null
}

export default function AlertHistory() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Folder filter
  const [folders, setFolders] = useState<FolderInfo[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)

  useEffect(() => {
    loadHistory()
    loadFolders()
  }, [])

  const loadHistory = async () => {
    try {
      const data = await api.get<Alert[]>('/alerts/history')
      setAlerts(data)
      setError(null)
    } catch (err) {
      setError('Failed to load alert history')
    } finally {
      setLoading(false)
    }
  }

  const loadFolders = async () => {
    try {
      const data = await api.get<FolderInfo[]>('/rules/folders')
      setFolders(data)
    } catch (err) {
      console.error('Failed to load folders:', err)
    }
  }

  const openClearConfirm = () => {
    setConfirmOpen(true)
  }

  const clearHistory = async () => {
    try {
      await api.delete('/alerts/history')
      setAlerts([])
      setError(null)
      setConfirmOpen(false)
    } catch (err) {
      setError('Failed to clear history')
      console.error(err)
    }
  }

  const cancelClear = () => {
    setConfirmOpen(false)
  }

  const filteredAlerts = alerts.filter(alert => {
    const matchesSearch = search === '' ||
      alert.alertname.toLowerCase().includes(search.toLowerCase()) ||
      alert.description.toLowerCase().includes(search.toLowerCase())
    const matchesFolder = selectedFolder === null ||
      (selectedFolder === '' ? !alert.folder : alert.folder === selectedFolder)
    return matchesSearch && matchesFolder
  })

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        Loading history...
      </div>
    )
  }

  if (error) {
    return <div className="error-state">{error}</div>
  }

  return (
    <div>
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">
          <History size={28} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
          Alert History
        </h1>
        {alerts.length > 0 && (
          <button
            className="btn btn-secondary"
            onClick={openClearConfirm}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444' }}
          >
            <Trash2 size={16} />
            Clear History
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Folder dropdown */}
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <select
            value={selectedFolder === null ? '__all__' : selectedFolder}
            onChange={(e) => {
              const val = e.target.value
              if (val === '__all__') setSelectedFolder(null)
              else setSelectedFolder(val)
            }}
            style={{
              width: 'fit-content',
              minWidth: '140px',
              padding: '8px 28px 8px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              cursor: 'pointer',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 6px center',
            }}
          >
            <option value="__all__">All Folders</option>
            {folders.map(f => (
              <option key={f.name} value={f.name}>{f.name}</option>
            ))}
          </select>
        </div>
        <div style={{ position: 'relative', maxWidth: '300px', width: '100%' }}>
          <Search size={16} style={{ 
            position: 'absolute', 
            left: '12px', 
            top: '50%', 
            transform: 'translateY(-50%)',
            color: 'var(--text-muted)'
          }} />
          <input
            type="text"
            placeholder="Search by name or description..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ 
              width: '100%', 
              paddingLeft: '36px',
            }}
          />
        </div>
      </div>

      {/* Count */}
      <div style={{ marginBottom: '16px', color: 'var(--text-muted)', fontSize: '14px' }}>
        {filteredAlerts.length} {filteredAlerts.length === 1 ? 'alert' : 'alerts'}
        {(search || selectedFolder !== null) && ` (filtered from ${alerts.length})`}
      </div>

      {selectedAlert ? (
        <div className="card">
          <button
            className="btn btn-secondary"
            onClick={() => setSelectedAlert(null)}
            style={{ marginBottom: '16px' }}
          >
            ← Back to list
          </button>
          
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>
            {selectedAlert.alertname}
          </h2>
          
          <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span className={`badge badge-${selectedAlert.severity === 'critical' ? 'critical' : selectedAlert.severity === 'warning' ? 'warning' : 'info'}`}>
              {selectedAlert.severity}
            </span>
            {selectedAlert.folder && (
              <span className="badge" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                <Folder size={10} style={{ verticalAlign: 'middle', marginRight: '2px' }} />
                {selectedAlert.folder}
              </span>
            )}
          </div>

          <div style={{ marginBottom: '12px' }}>
            <strong style={{ color: 'var(--text-secondary)' }}>Description:</strong>
            <p style={{ marginTop: '4px' }}>{selectedAlert.description}</p>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <strong style={{ color: 'var(--text-secondary)' }}>Started:</strong>
            <p style={{ marginTop: '4px' }}>{new Date(selectedAlert.starts_at).toLocaleString()}</p>
          </div>

          {selectedAlert.ends_at && (
            <div style={{ marginBottom: '12px' }}>
              <strong style={{ color: 'var(--text-secondary)' }}>Resolved:</strong>
              <p style={{ marginTop: '4px' }}>{new Date(selectedAlert.ends_at).toLocaleString()}</p>
            </div>
          )}

          <div style={{ marginBottom: '12px' }}>
            <strong style={{ color: 'var(--text-secondary)' }}>Labels:</strong>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
              {Object.entries(selectedAlert.labels).map(([key, value]) => (
                <span key={key} style={{ 
                  backgroundColor: 'var(--bg-tertiary)',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '12px'
                }}>
                  {key}={value}
                </span>
              ))}
            </div>
          </div>

          {/* Silence info */}
          {selectedAlert.silenced_by && (
            <div style={{ 
              backgroundColor: 'rgba(245, 158, 11, 0.08)',
              padding: '12px',
              borderRadius: 'var(--radius-sm)',
              borderLeft: '3px solid #f59e0b',
              marginBottom: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <VolumeX size={14} color="#f59e0b" />
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#f59e0b' }}>
                  Silenced
                </span>
              </div>
              <p style={{ fontSize: '13px', lineHeight: '1.5', color: 'var(--text-secondary)' }}>
                This alert was silenced via {selectedAlert.silenced_by.startsWith('folder:') ? 'folder' : 'rule'} 
                {' '}<strong>{selectedAlert.silenced_by.split(':')[1]}</strong>
                {selectedAlert.silenced_at && (
                  <span> at {new Date(selectedAlert.silenced_at).toLocaleString()}</span>
                )}
              </p>
            </div>
          )}

          {selectedAlert.diagnosis && (
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
              <p style={{ fontSize: '13px', lineHeight: '1.5' }}>{selectedAlert.diagnosis}</p>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filteredAlerts.length === 0 ? (
            <div className="empty-state">
              <p>No alerts in history</p>
              {selectedFolder !== null && <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Try changing the folder filter</p>}
            </div>
          ) : (
            filteredAlerts.map(alert => (
              <div
                key={alert.id}
                className="card"
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedAlert(alert)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: '15px', fontWeight: 600 }}>{alert.alertname}</h3>
                      <span className={`badge badge-${alert.severity === 'critical' ? 'critical' : alert.severity === 'warning' ? 'warning' : 'info'}`}>
                        {alert.severity}
                      </span>
                      {alert.folder && (
                        <span className="badge" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)', fontSize: '11px' }}>
                          <Folder size={10} style={{ verticalAlign: 'middle', marginRight: '2px' }} />
                          {alert.folder}
                        </span>
                      )}
                      {alert.silenced_by && (
                        <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', fontSize: '11px' }}>
                          <VolumeX size={10} style={{ verticalAlign: 'middle', marginRight: '2px' }} />
                          Silenced
                        </span>
                      )}
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                      {alert.description}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0, marginLeft: '12px' }}>
                    <div>{new Date(alert.starts_at).toLocaleDateString()}</div>
                    {alert.ends_at && (
                      <div>Resolved: {new Date(alert.ends_at).toLocaleDateString()}</div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={confirmOpen}
        title="Clear Alert History"
        message="Are you sure you want to clear all alert history? This action cannot be undone."
        confirmText="Clear"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={clearHistory}
        onCancel={cancelClear}
      />
    </div>
  )
}