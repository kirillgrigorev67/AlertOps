import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, Loader, Check, Wand2, Brain, Folder, FolderPlus, ChevronDown, Search, X } from 'lucide-react'
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
  const [folder, setFolder] = useState('')
  const [existingFolders, setExistingFolders] = useState<string[]>([])
  const [variants, setVariants] = useState<AlertVariant[]>([])
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [providers, setProviders] = useState<LLMProvider[]>([])
  const [selectedProvider, setSelectedProvider] = useState<string>('')
  const [providersLoading, setProvidersLoading] = useState(true)

  useEffect(() => {
    loadProviders()
    loadFolders()
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

  const loadFolders = async () => {
    try {
      const data = await api.get<string[]>('/rules/folders')
      setExistingFolders(data)
    } catch (err) {
      console.error('Failed to load folders:', err)
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
        folder: folder.trim() || null,
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

  const folderIsNew = folder.trim() && !existingFolders.includes(folder.trim())
  
  // Folder dropdown state
  const [folderDropdownOpen, setFolderDropdownOpen] = useState(false)
  const [folderSearch, setFolderSearch] = useState('')
  const folderDropdownRef = useRef<HTMLDivElement>(null)
  
  // Filter folders by search
  const filteredFolders = folderSearch.trim() 
    ? existingFolders.filter(f => f.toLowerCase().includes(folderSearch.toLowerCase()))
    : existingFolders
  
  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (folderDropdownRef.current && !folderDropdownRef.current.contains(event.target as Node)) {
        setFolderDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

          {/* Folder selection - Custom Dropdown */}
          <div style={{ marginBottom: '12px' }} ref={folderDropdownRef}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500 }}>
              <Folder size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
              Folder
            </label>
            
            {/* Dropdown trigger button */}
            <button
              type="button"
              onClick={() => setFolderDropdownOpen(!folderDropdownOpen)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                textAlign: 'left',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Folder size={14} color="var(--text-muted)" />
                {folder || 'None'}
                {folderIsNew && (
                  <span style={{ 
                    fontSize: '11px', 
                    color: 'var(--accent-primary)',
                    background: 'rgba(99, 102, 241, 0.15)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}>
                    new
                  </span>
                )}
              </span>
              <ChevronDown 
                size={16} 
                color="var(--text-muted)" 
                style={{ 
                  transform: folderDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease',
                }} 
              />
            </button>
            
            {/* Dropdown menu */}
            {folderDropdownOpen && (
              <div style={{
                marginTop: '4px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--surface)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                zIndex: 100,
                position: 'relative',
              }}>
                {/* Search input */}
                <div style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ 
                      position: 'absolute', 
                      left: '10px', 
                      top: '50%', 
                      transform: 'translateY(-50%)',
                      color: 'var(--text-muted)',
                      pointerEvents: 'none',
                    }} />
                    <input
                      type="text"
                      value={folderSearch}
                      onChange={e => setFolderSearch(e.target.value)}
                      placeholder="Search folders..."
                      autoFocus
                      style={{ 
                        width: '100%',
                        paddingLeft: '32px',
                        paddingRight: '28px',
                        paddingTop: '6px',
                        paddingBottom: '6px',
                        fontSize: '13px',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                      }}
                    />
                    {folderSearch && (
                      <X 
                        size={14} 
                        style={{ 
                          position: 'absolute', 
                          right: '8px', 
                          top: '50%', 
                          transform: 'translateY(-50%)',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                        }}
                        onClick={() => setFolderSearch('')}
                      />
                    )}
                  </div>
                </div>
                
                {/* Folder list - max 5 visible + scroll */}
                <div style={{ 
                  maxHeight: '200px', 
                  overflowY: 'auto',
                }}>
                  {/* None option */}
                  <button
                    type="button"
                    onClick={() => {
                      setFolder('')
                      setFolderDropdownOpen(false)
                      setFolderSearch('')
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: 'none',
                      borderBottom: '1px solid var(--border)',
                      background: folder === '' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                      color: folder === '' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      fontSize: '13px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <span style={{ fontStyle: 'italic' }}>None</span>
                    {folder === '' && <Check size={14} style={{ marginLeft: 'auto' }} />}
                  </button>

                  {/* Existing folders */}
                  {filteredFolders.length > 0 ? (
                    filteredFolders.map(f => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => {
                          setFolder(f)
                          setFolderDropdownOpen(false)
                          setFolderSearch('')
                        }}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: 'none',
                          borderBottom: '1px solid var(--border)',
                          background: folder === f ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                          color: folder === f ? 'var(--accent-primary)' : 'var(--text-secondary)',
                          fontSize: '13px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <Folder size={14} />
                        {f}
                        {folder === f && <Check size={14} style={{ marginLeft: 'auto' }} />}
                      </button>
                    ))
                  ) : folderSearch.trim() ? (
                    <div style={{ 
                      padding: '12px', 
                      textAlign: 'center', 
                      color: 'var(--text-muted)',
                      fontSize: '13px',
                    }}>
                      No folders found. Type to create new.
                    </div>
                  ) : existingFolders.length === 0 ? (
                    <div style={{ 
                      padding: '12px', 
                      textAlign: 'center', 
                      color: 'var(--text-muted)',
                      fontSize: '13px',
                    }}>
                      No folders yet. Type to create new.
                    </div>
                  ) : null}
                </div>
                
                {/* Create new folder hint */}
                {folderSearch.trim() && !existingFolders.includes(folderSearch.trim()) && (
                  <div style={{ 
                    padding: '8px 12px', 
                    borderTop: '1px solid var(--border)',
                    background: 'rgba(99, 102, 241, 0.05)',
                  }}>
                    <button
                      type="button"
                      onClick={() => {
                        setFolder(folderSearch.trim())
                        setFolderDropdownOpen(false)
                        setFolderSearch('')
                      }}
                      style={{
                        width: '100%',
                        border: 'none',
                        background: 'none',
                        color: 'var(--accent-primary)',
                        fontSize: '13px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <FolderPlus size={14} />
                      Create "{folderSearch.trim()}"
                    </button>
                  </div>
                )}
              </div>
            )}
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