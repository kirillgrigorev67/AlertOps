import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutDashboard, ChevronRight, AlertTriangle, RefreshCw, Search } from 'lucide-react'
import api from '../api/client'

interface Dashboard {
  uid: string
  title: string
  url: string
}

interface Panel {
  id: number
  title: string
  type: string
  query?: string
  query_type?: string
  multiple_queries: boolean
  embed_url?: string
}

export default function Dashboards() {
  const [dashboards, setDashboards] = useState<Dashboard[]>([])
  const [panels, setPanels] = useState<Panel[]>([])
  const [selectedDashboard, setSelectedDashboard] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    loadDashboards()
  }, [])

  const loadDashboards = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await api.get<Dashboard[]>('/dashboards')
      setDashboards(data)
    } catch (err) {
      setError('Failed to load dashboards')
    } finally {
      setLoading(false)
    }
  }

  const loadPanels = async (uid: string) => {
    try {
      setLoading(true)
      setError(null)
      const data = await api.get<Panel[]>(`/dashboards/${uid}/panels`)
      // Add cache-busting timestamp to embed URLs so iframe reloads
      const timestamp = Date.now()
      const panelsWithCacheBust = data.map(p => ({
        ...p,
        embed_url: p.embed_url ? `${p.embed_url}&_t=${timestamp}` : undefined
      }))
      setPanels(panelsWithCacheBust)
      setSelectedDashboard(uid)
    } catch (err) {
      setError('Failed to load panels')
    } finally {
      setLoading(false)
    }
  }

  const createAlert = (panel: Panel) => {
    navigate('/create-alert', {
      state: {
        dashboardUid: selectedDashboard,
        panel,
      },
    })
  }

  if (loading && dashboards.length === 0) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        Loading dashboards...
      </div>
    )
  }

  if (error && dashboards.length === 0) {
    return (
      <div className="error-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        <div>{error}</div>
        <button
          className="btn btn-primary"
          onClick={loadDashboards}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <RefreshCw size={16} />
          Retry
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <h1 className="page-title">
          <LayoutDashboard size={28} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
          Dashboards
        </h1>
        <div style={{ position: 'relative', width: '260px' }}>
          <Search size={16} style={{ 
            position: 'absolute', 
            left: '12px', 
            top: '50%', 
            transform: 'translateY(-50%)',
            color: 'var(--text-muted)'
          }} />
          <input
            type="text"
            placeholder="Search dashboards or panels..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ 
              width: '100%', 
              paddingLeft: '36px',
            }}
          />
        </div>
      </div>

      {!selectedDashboard ? (
        <div>
          <div className="grid grid-2">
            {dashboards
              .filter(d => 
                search === '' || 
                d.title.toLowerCase().includes(search.toLowerCase()) ||
                d.uid.toLowerCase().includes(search.toLowerCase())
              )
              .map(d => (
            <div
              key={d.uid}
              className="card"
              style={{ cursor: 'pointer' }}
              onClick={() => loadPanels(d.uid)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>
                    {d.title}
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                    UID: {d.uid}
                  </p>
                </div>
                <ChevronRight size={20} color="var(--text-secondary)" />
              </div>
            </div>
              ))}
          </div>
        </div>
      ) : (
        <div>
          <button
            className="btn btn-secondary"
            style={{ marginBottom: '16px' }}
            onClick={() => {
              setSelectedDashboard(null)
              setPanels([])
            }}
          >
            ← Back to Dashboards
          </button>

          <h2 style={{ marginBottom: '16px', fontSize: '18px' }}>
            Panels in {dashboards.find(d => d.uid === selectedDashboard)?.title}
          </h2>

          <div className="grid grid-2">
            {panels
              .filter(p => 
                search === '' || 
                p.title.toLowerCase().includes(search.toLowerCase())
              )
              .map(panel => (
              <div key={panel.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>
                      {panel.title}
                    </h3>
                    
                    {panel.multiple_queries ? (
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px',
                        color: 'var(--warning)',
                        fontSize: '13px',
                        marginBottom: '8px'
                      }}>
                        <AlertTriangle size={14} />
                        Multiple queries - cannot auto-generate alert
                      </div>
                    ) : panel.query ? (
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ 
                          fontSize: '12px', 
                          color: 'var(--text-muted)',
                          textTransform: 'uppercase',
                          marginBottom: '4px'
                        }}>
                          {panel.query_type}
                        </div>
                        <code style={{ 
                          display: 'block',
                          backgroundColor: 'var(--bg-primary)',
                          padding: '8px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '12px',
                          overflow: 'auto',
                          maxHeight: '80px'
                        }}>
                          {panel.query}
                        </code>
                      </div>
                    ) : (
                      <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '8px' }}>
                        No query available
                      </p>
                    )}
                  </div>
                </div>

                {/* Grafana Embed Graph */}
                {panel.embed_url && (
                  <div style={{ 
                    marginBottom: '12px',
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)'
                  }}>
                    <iframe
                      src={panel.embed_url}
                      width="100%"
                      height="200"
                      frameBorder="0"
                      title={`${panel.title} graph`}
                      style={{ 
                        display: 'block',
                        backgroundColor: 'var(--bg-primary)'
                      }}
                    />
                  </div>
                )}

                <button
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => createAlert(panel)}
                  disabled={panel.multiple_queries || !panel.query}
                >
                  Create Alert
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}