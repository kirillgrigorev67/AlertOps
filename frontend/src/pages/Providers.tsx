import { useState, useEffect } from 'react'
import { Settings, Plus, Trash2, Star, Check, X, Edit2, Loader, RefreshCw, Search } from 'lucide-react'
import api from '../api/client'
import ConfirmModal from '../components/ConfirmModal'

interface LLMProvider {
  id: string
  name: string
  provider_type: string
  base_url: string
  api_key: string
  model: string
  is_default: boolean
  created_at: string
}

interface ProviderStatus {
  provider_id: string
  status: 'healthy' | 'unhealthy' | 'unknown'
  error: string | null
}

export default function Providers() {
  const [providers, setProviders] = useState<LLMProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProvider, setEditingProvider] = useState<LLMProvider | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  // Delete confirmation
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [providerToDelete, setProviderToDelete] = useState<string | null>(null)

  // Provider health statuses
  const [statuses, setStatuses] = useState<Record<string, ProviderStatus>>({})
  const [testingIds, setTestingIds] = useState<Set<string>>(new Set())

  // Form state
  const [name, setName] = useState('')
  const [providerType, setProviderType] = useState('openai')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [isDefault, setIsDefault] = useState(false)

  useEffect(() => {
    loadProviders()
  }, [])

  const loadProviders = async () => {
    try {
      setLoading(true)
      const data = await api.get<LLMProvider[]>('/providers')
      setProviders(data)
      setError(null)
      // Initialize unknown status for new providers
      const newStatuses: Record<string, ProviderStatus> = {}
      data.forEach(p => {
        newStatuses[p.id] = statuses[p.id] || { provider_id: p.id, status: 'unknown', error: null }
      })
      setStatuses(newStatuses)
    } catch (err) {
      setError('Failed to load providers')
    } finally {
      setLoading(false)
    }
  }

  const testProvider = async (providerId: string) => {
    setTestingIds(prev => new Set(prev).add(providerId))
    try {
      const result = await api.post<ProviderStatus>(`/providers/${providerId}/test`, {})
      setStatuses(prev => ({
        ...prev,
        [providerId]: result,
      }))
    } catch (err: any) {
      setStatuses(prev => ({
        ...prev,
        [providerId]: { provider_id: providerId, status: 'unhealthy', error: err?.message || 'Test failed' },
      }))
    } finally {
      setTestingIds(prev => {
        const next = new Set(prev)
        next.delete(providerId)
        return next
      })
    }
  }

  const testAllProviders = async () => {
    for (const provider of providers) {
      await testProvider(provider.id)
    }
  }

  const resetForm = () => {
    setName('')
    setProviderType('openai')
    setBaseUrl('')
    setApiKey('')
    setModel('')
    setIsDefault(false)
    setEditingProvider(null)
    setError(null)
  }

  const openAddModal = () => {
    resetForm()
    setModalOpen(true)
  }

  const openEditModal = (provider: LLMProvider) => {
    setEditingProvider(provider)
    setName(provider.name)
    setProviderType(provider.provider_type || 'openai')
    setBaseUrl(provider.base_url)
    setApiKey(provider.api_key)
    setModel(provider.model)
    setIsDefault(provider.is_default)
    setError(null)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    resetForm()
  }

  const validateForm = () => {
    if (!name.trim()) return 'Name is required'
    if (!baseUrl.trim()) return 'Base URL is required'
    if (!model.trim()) return 'Model is required'
    return null
  }

  const saveProvider = async () => {
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    setError(null)

    try {
      const payload = {
        id: editingProvider ? editingProvider.id : crypto.randomUUID(),
        name,
        provider_type: providerType,
        base_url: baseUrl,
        api_key: apiKey,
        model,
        is_default: isDefault,
      }

      if (editingProvider) {
        await api.put(`/providers/${editingProvider.id}`, payload)
      } else {
        await api.post('/providers', payload)
      }

      closeModal()
      loadProviders()
    } catch (err: any) {
      const msg = err?.message || 'Failed to save provider'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const openDeleteConfirm = (id: string) => {
    setProviderToDelete(id)
    setConfirmOpen(true)
  }

  const confirmDelete = async () => {
    if (!providerToDelete) return
    try {
      await api.delete(`/providers/${providerToDelete}`)
      setConfirmOpen(false)
      setProviderToDelete(null)
      loadProviders()
    } catch (err) {
      console.error('Failed to delete provider:', err)
    }
  }

  const cancelDelete = () => {
    setConfirmOpen(false)
    setProviderToDelete(null)
  }

  const setDefault = async (id: string) => {
    try {
      await api.post(`/providers/${id}/default`, {})
      loadProviders()
    } catch (err) {
      console.error('Failed to set default:', err)
    }
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
      </div>
    )
  }

  const filteredProviders = providers.filter(provider => {
    if (search === '') return true
    const term = search.toLowerCase()
    return (
      provider.name.toLowerCase().includes(term) ||
      provider.model.toLowerCase().includes(term)
    )
  })

  return (
    <div>
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <h1 className="page-title">
          <Settings size={28} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
          LLM Providers
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
              placeholder="Search providers..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ 
                width: '100%', 
                paddingLeft: '36px',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" onClick={testAllProviders} disabled={providers.length === 0}>
              <RefreshCw size={16} />
              Test All
            </button>
            <button className="btn btn-primary" onClick={openAddModal}>
              <Plus size={18} />
              Add Provider
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        {filteredProviders.map(provider => (
          <div key={provider.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600 }}>{provider.name}</h3>
                  {provider.is_default && (
                    <span className="badge" style={{ background: 'var(--success)', color: '#fff', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Star size={10} />
                      Default
                    </span>
                  )}
                  {(() => {
                    const st = statuses[provider.id]
                    if (!st || st.status === 'unknown') return null
                    const isHealthy = st.status === 'healthy'
                    return (
                      <span
                        className="badge"
                        style={{
                          background: isHealthy ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
                          color: isHealthy ? 'var(--success)' : 'var(--error)',
                          fontSize: '11px',
                          cursor: st.error ? 'help' : 'default',
                        }}
                        title={st.error || undefined}
                      >
                        {isHealthy ? 'Online' : 'Offline'}
                      </span>
                    )
                  })()}
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                  {provider.model}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => testProvider(provider.id)}
                  disabled={testingIds.has(provider.id)}
                  title="Test connection"
                  style={{ padding: '6px' }}
                >
                  {testingIds.has(provider.id) ? (
                    <Loader size={14} className="spinner" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                </button>
                {!provider.is_default && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => setDefault(provider.id)}
                    title="Set as default"
                    style={{ padding: '6px' }}
                  >
                    <Star size={14} />
                  </button>
                )}
                {provider.id !== 'demo-default' && (
                  <>
                    <button
                      className="btn btn-secondary"
                      onClick={() => openEditModal(provider)}
                      title="Edit provider"
                      style={{ padding: '6px' }}
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => openDeleteConfirm(provider.id)}
                      title="Delete"
                      style={{ padding: '6px', color: '#ef4444' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              <div style={{ marginBottom: '4px' }}>Type: {provider.provider_type}</div>
              <div style={{ marginBottom: '4px' }}>URL: {provider.base_url}</div>
              <div>Key: {provider.api_key ? '••••••••' : 'Not set'}</div>
            </div>
          </div>
        ))}
      </div>

      {filteredProviders.length === 0 && (
        <div className="empty-state">
          <Settings size={48} color="var(--text-muted)" />
          <h3>{search ? 'No providers match your search' : 'No LLM providers configured'}</h3>
          <p>{search ? 'Try a different search term' : 'Add a provider to enable AI-powered alert generation and diagnosis'}</p>
          {!search && (
            <button className="btn btn-primary" onClick={openAddModal} style={{ marginTop: '16px' }}>
              <Plus size={16} />
              Add Provider
            </button>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={confirmOpen}
        title="Delete Provider"
        message="Are you sure you want to delete this LLM provider? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />

      {/* Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e: React.MouseEvent) => e.stopPropagation()} style={{ maxWidth: '520px', width: '90%' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                {editingProvider ? 'Edit Provider' : 'Add Provider'}
              </h3>
              <button onClick={closeModal} className="btn btn-secondary" style={{ padding: '6px' }}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. DeepSeek"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Provider Type</label>
                  <select
                    className="form-control"
                    value={providerType}
                    onChange={e => setProviderType(e.target.value)}
                  >
                    <option value="openai">OpenAI Compatible</option>
                    <option value="demo">Demo (no API key needed)</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Model *</label>
                <input
                  type="text"
                  className="form-control"
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  placeholder="e.g. deepseek-chat"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Base URL *</label>
                <input
                  type="text"
                  className="form-control"
                  value={baseUrl}
                  onChange={e => setBaseUrl(e.target.value)}
                  placeholder="https://api.deepseek.com/v1"
                />
              </div>

              <div className="form-group">
                <label className="form-label">API Key</label>
                <input
                  type="password"
                  className="form-control"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="sk-..."
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={isDefault}
                  onChange={e => setIsDefault(e.target.checked)}
                />
                <label htmlFor="isDefault" style={{ fontSize: '14px' }}>Set as default provider</label>
              </div>

              {error && (
                <div className="alert alert-error">
                  <Settings size={16} />
                  {error}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={closeModal} className="btn btn-secondary" disabled={saving}>
                Cancel
              </button>
              <button onClick={saveProvider} className="btn btn-primary" disabled={saving}>
                {saving ? (
                  <>
                    <Loader size={16} className="spinner" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    {editingProvider ? 'Save Changes' : 'Add Provider'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}