import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, Loader, Check, Wand2, Brain } from 'lucide-react'
import api from '../api/client'

interface AlertVariant {
  name: string
  description: string
  query: string
  condition: string
  duration: string
}

interface LLMProvider {
  id: string
  name: string
  model: string
  provider_type: string
  is_default: boolean
}

interface LocationState {
  dashboardUid?: string
  panel?: {
    title: string
    query?: string
    query_type?: string
    multiple_queries?: boolean
  }
}

export default function CreateAlert() {
  const location = useLocation()
  const navigate = useNavigate()
  const { panel, dashboardUid } = (location.state as LocationState) || {}

  // Standalone mode = no panel from dashboard
  const isStandalone = !panel

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [query, setQuery] = useState(panel?.query || '')
  const [queryType, setQueryType] = useState(panel?.query_type || 'promql')
  const [condition, setCondition] = useState('> 80')
  const [duration, setDuration] = useState('5m')
  const [severity, setSeverity] = useState('warning')
  const [resolveTimeout, setResolveTimeout] = useState('5m')
  const [variants, setVariants] = useState<AlertVariant[]>([])
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [providers, setProviders] = useState<LLMProvider[]>([])
  const [selectedProvider, setSelectedProvider] = useState<string>('')
  const [providersLoading, setProvidersLoading] = useState(true)

  useEffect(() => {
    loadProviders()
  }, [])

  const loadProviders = async () => {
    try {
      setProvidersLoading(true)
      const data = await api.get<LLMProvider[]>('/providers')
      setProviders(data)
      // Auto-select default provider
      const defaultProvider = data.find((p: LLMProvider) => p.is_default)
      if (defaultProvider) {
        setSelectedProvider(defaultProvider.id)
      } else if (data.length > 0) {
        setSelectedProvider(data[0].id)
      }
    } catch (err) {
      console.error('Failed to load providers:', err)
    } finally {
      setProvidersLoading(false)
    }
  }

  const generateVariants = async () => {
    if (!query) return
    setGenerating(true)
    setError(null)
    
    try {
      const payload: Record<string, string> = {
        query,
        query_type: queryType,
        dashboard_title: 'Dashboard',
        panel_title: panel?.title || 'Panel',
      }
      if (selectedProvider) {
        payload.provider_id = selectedProvider
      }
      const data = await api.post<AlertVariant[]>('/ai/generate-alerts', payload)
      setVariants(data)
    } catch (err) {
      setError('Failed to generate alert variants')
    } finally {
      setGenerating(false)
    }
  }

  const selectVariant = (variant: AlertVariant) => {
    setName(variant.name)
    setDescription(variant.description)
    setQuery(variant.query)
    setCondition(variant.condition)
    setDuration(variant.duration)
  }

  const saveAlert = async () => {
    if (!name || !description || !query) {
      setError('Name, description and query are required')
      return
    }

    // Parse resolve timeout - strip 'm' suffix if present
    const timeoutStr = resolveTimeout.replace(/m$/, '').trim()
    const timeoutNum = parseInt(timeoutStr)
    if (isNaN(timeoutNum) || timeoutNum < 3) {
      setError('Resolve timeout must be at least 3 minutes')
      return
    }

    setSaving(true)
    setError(null)

    try {
      await api.post('/rules', {
        id: crypto.randomUUID(),
        name,
        description,
        query,
        query_type: queryType,
        condition,
        duration,
        severity,
        resolve_timeout: parseInt(resolveTimeout) || 5,
        labels: {},
        annotations: {
          summary: name,
          description,
        },
        panel_uid: dashboardUid || null,
        dashboard_uid: dashboardUid || null,
      })
      navigate('/alerts')
    } catch (err) {
      setError('Failed to save alert')
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="header">
        <h1 className="page-title">Create Alert</h1>
      </div>

      {panel?.multiple_queries && (
        <div className="card" style={{ 
          marginBottom: '16px', 
          borderLeft: '4px solid var(--warning)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <AlertTriangle size={20} color="var(--warning)" />
          <span>This panel has multiple queries. Automatic alert generation is not available, but you can enter a query manually.</span>
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 600 }}>Alert Details</h3>
          
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. High CPU Usage"
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Description *</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What does this alert monitor?"
              rows={3}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>

          {isStandalone && (
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Query Type</label>
              <select 
                value={queryType} 
                onChange={e => setQueryType(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="promql">PromQL (Prometheus)</option>
                <option value="logql">LogQL (Loki)</option>
              </select>
            </div>
          )}

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Query</label>
            <textarea
              value={query}
              onChange={e => setQuery(e.target.value)}
              rows={4}
              placeholder={queryType === 'logql' ? '{job="app"} |= "error"' : 'up == 1'}
              style={{ 
                width: '100%', 
                resize: 'vertical',
                fontFamily: 'monospace',
                fontSize: '12px'
              }}
            />
            <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
              Type: {queryType.toUpperCase()}
              {isStandalone && (
                <span style={{ marginLeft: '8px' }}>
                  (standalone mode — no dashboard linked)
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Condition</label>
              <input
                type="text"
                value={condition}
                onChange={e => setCondition(e.target.value)}
                placeholder="> 80"
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Duration</label>
              <input
                type="text"
                value={duration}
                onChange={e => setDuration(e.target.value)}
                placeholder="5m"
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Severity</label>
              <select value={severity} onChange={e => setSeverity(e.target.value)}>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Resolve Timeout</label>
              <input
                type="text"
                value={resolveTimeout}
                onChange={e => setResolveTimeout(e.target.value)}
                placeholder="5m"
              />
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>minutes</div>
            </div>
          </div>

          <div style={{ marginBottom: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
            Resolve timeout: delay before closing the alert after metric recovery. Prevents flapping.
          </div>

          {error && (
            <div style={{ color: 'var(--error)', fontSize: '14px', marginBottom: '12px' }}>
              {error}
            </div>
          )}

          <button
            className="btn btn-primary"
            onClick={saveAlert}
            disabled={saving}
            style={{ width: '100%' }}
          >
            {saving ? <Loader size={16} className="spinner" /> : <Check size={16} />}
            {saving ? 'Saving...' : 'Save Alert'}
          </button>
        </div>

        <div>
          {/* Provider Selection */}
          {providers.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', color: 'var(--text-muted)' }}>
                <Brain size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                AI Model
              </label>
              <select
                value={selectedProvider}
                onChange={e => setSelectedProvider(e.target.value)}
                disabled={generating}
                style={{ width: '100%', fontSize: '13px' }}
              >
                {providers.map((provider: LLMProvider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name} ({provider.model})
                    {provider.is_default ? ' — default' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!panel?.multiple_queries && (
            <button
              className="btn btn-secondary"
              onClick={generateVariants}
              disabled={generating || !query || providersLoading}
              style={{ marginBottom: '16px', width: '100%' }}
            >
              {generating ? <Loader size={16} className="spinner" /> : <Wand2 size={16} />}
              {generating ? 'Generating...' : providersLoading ? 'Loading models...' : 'Generate AI Variants'}
            </button>
          )}

          {variants.length > 0 && (
            <div>
              <h3 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: 600 }}>
                AI-Generated Variants
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {variants.map((variant, index) => (
                  <div
                    key={index}
                    className="card"
                    style={{ cursor: 'pointer' }}
                    onClick={() => selectVariant(variant)}
                  >
                    <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>
                      {variant.name}
                    </h4>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                      {variant.description}
                    </p>
                    <code style={{ 
                      display: 'block',
                      backgroundColor: 'var(--bg-primary)',
                      padding: '8px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '11px',
                      overflow: 'auto'
                    }}>
                      {variant.query} {variant.condition}
                    </code>
                    <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      Duration: {variant.duration}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}