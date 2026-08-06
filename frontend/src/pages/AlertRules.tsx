import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Search, Plus, Trash2, Edit2, AlertTriangle, Clock, Tag, Bell, X, Save, Loader, Brain, Sparkles } from 'lucide-react'
import api from '../api/client'
import ConfirmModal from '../components/ConfirmModal'

interface AlertRule {
  id: string
  name: string
  description: string
  query: string
  query_type: string
  condition: string
  duration: string
  severity: string
  labels: Record<string, string>
  annotations: Record<string, string>
  created_at: string
  updated_at: string
}

interface LLMProvider {
  id: string
  name: string
  model: string
  is_default: boolean
}

interface AlertVariant {
  name: string
  description: string
  query: string
  condition: string
  duration: string
}

export default function AlertRules() {
  const [rules, setRules] = useState<AlertRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [ruleToDelete, setRuleToDelete] = useState<string | null>(null)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null)
  const [editForm, setEditForm] = useState<Partial<AlertRule>>({})
  const [saving, setSaving] = useState(false)

  // AI generation in edit modal
  const [providers, setProviders] = useState<LLMProvider[]>([])
  const [selectedProvider, setSelectedProvider] = useState('')
  const [generating, setGenerating] = useState(false)
  const [aiVariants, setAiVariants] = useState<AlertVariant[]>([])
  const [aiError, setAiError] = useState('')

  useEffect(() => {
    loadRules()
  }, [])

  const loadRules = async () => {
    try {
      setLoading(true)
      const data = await api.get<AlertRule[]>('/rules')
      setRules(data)
      setError('')
    } catch (err) {
      setError('Failed to load alert rules')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const openDeleteConfirm = (id: string) => {
    setRuleToDelete(id)
    setConfirmOpen(true)
  }

  const deleteRule = async () => {
    if (!ruleToDelete) return
    
    try {
      await api.delete(`/rules/${ruleToDelete}`)
      setRules(rules.filter((r: AlertRule) => r.id !== ruleToDelete))
      setConfirmOpen(false)
      setRuleToDelete(null)
    } catch (err) {
      setError('Failed to delete rule')
      console.error(err)
    }
  }

  const cancelDelete = () => {
    setConfirmOpen(false)
    setRuleToDelete(null)
  }

  const loadProviders = async () => {
    try {
      const data = await api.get<LLMProvider[]>('/providers')
      setProviders(data)
      const defaultProvider = data.find(p => p.is_default)
      if (defaultProvider) {
        setSelectedProvider(defaultProvider.id)
      } else if (data.length > 0) {
        setSelectedProvider(data[0].id)
      }
    } catch (err) {
      console.error('Failed to load providers:', err)
    }
  }

  const openEditModal = (rule: AlertRule) => {
    setEditingRule(rule)
    setEditForm({ ...rule })
    setAiVariants([])
    setAiError('')
    loadProviders()
    setEditModalOpen(true)
  }

  const closeEditModal = () => {
    setEditModalOpen(false)
    setEditingRule(null)
    setEditForm({})
    setAiVariants([])
    setAiError('')
    setSelectedProvider('')
  }

  const generateVariants = async () => {
    if (!editForm.query) {
      setAiError('Query is required to generate variants')
      return
    }
    setGenerating(true)
    setAiError('')
    setAiVariants([])

    try {
      const data = await api.post<AlertVariant[]>('/ai/generate-alerts', {
        query: editForm.query,
        query_type: editForm.query_type || 'promql',
        dashboard_title: 'Alert Rule Editor',
        panel_title: editForm.name || 'Unknown',
        provider_id: selectedProvider || undefined,
      })
      setAiVariants(data)
    } catch (err: any) {
      setAiError(err?.message || 'Failed to generate variants')
    } finally {
      setGenerating(false)
    }
  }

  const applyVariant = (variant: AlertVariant) => {
    setEditForm(prev => ({
      ...prev,
      query: variant.query,
      condition: variant.condition,
      duration: variant.duration,
    }))
    setAiVariants([])
  }

  const saveEdit = async () => {
    if (!editingRule) return
    try {
      setSaving(true)
      const updated = await api.put<AlertRule>(`/rules/${editingRule.id}`, editForm)
      setRules(rules.map((r: AlertRule) => r.id === updated.id ? updated : r))
      closeEditModal()
    } catch (err) {
      setError('Failed to update rule')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const filteredRules = rules.filter((rule: AlertRule) => 
    searchQuery === '' ||
    rule.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    rule.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    rule.query.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return '#ef4444'
      case 'warning': return '#f59e0b'
      case 'info': return '#3b82f6'
      default: return '#6b7280'
    }
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 className="page-title">Alert Rules</h1>
        <Link to="/create-alert" className="btn btn-primary">
          <Plus size={18} />
          Create Rule
        </Link>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: '16px' }}>
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      {/* Search */}
      <div style={{ marginBottom: '20px' }}>
        <div className="form-group" style={{ maxWidth: '400px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-control"
              placeholder="Search rules by name, description, or query..."
              value={searchQuery}
              onChange={(e: { target: { value: string } }) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '40px' }}
            />
          </div>
        </div>
      </div>

      {/* Rules count */}
      <div style={{ marginBottom: '16px', color: 'var(--text-muted)', fontSize: '14px' }}>
        {filteredRules.length} {filteredRules.length === 1 ? 'rule' : 'rules'} 
        {searchQuery && ` (filtered from ${rules.length})`}
      </div>

      {/* Rules list */}
      {filteredRules.length === 0 ? (
        <div className="empty-state">
          <Bell size={48} color="var(--text-muted)" />
          <h3>No alert rules found</h3>
          <p>{searchQuery ? 'Try adjusting your search query' : 'Create your first alert rule from a dashboard panel'}</p>
          {!searchQuery && (
            <Link to="/dashboards" className="btn btn-primary" style={{ marginTop: '16px' }}>
              Browse Dashboards
            </Link>
          )}
        </div>
      ) : (
        <div className="alert-list">
          {filteredRules.map((rule: AlertRule) => (
            <div key={rule.id} className="alert-card">
              <div className="alert-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0, overflow: 'hidden' }}>
                  <h3 className="alert-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rule.name}</h3>
                  <span
                    className="badge"
                    style={{
                      background: `${getSeverityColor(rule.severity)}20`,
                      color: getSeverityColor(rule.severity),
                      flexShrink: 0,
                    }}
                  >
                    {rule.severity}
                  </span>
                  <span
                    className="badge"
                    style={{
                      background: 'var(--bg-tertiary)',
                      color: 'var(--text-muted)',
                      flexShrink: 0,
                    }}
                  >
                    {rule.query_type ? rule.query_type.toUpperCase() : 'N/A'}
                  </span>
                </div>
                <button
                  onClick={() => openEditModal(rule)}
                  className="btn btn-secondary"
                  style={{ padding: '6px', marginLeft: '12px', flexShrink: 0 }}
                  title="Edit rule"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => openDeleteConfirm(rule.id)}
                  className="btn btn-secondary"
                  style={{ padding: '6px', color: '#ef4444', marginLeft: '8px', flexShrink: 0 }}
                  title="Delete rule"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {rule.description && (
                <p style={{ color: 'var(--text-secondary)', marginBottom: '12px', fontSize: '14px' }}>
                  {rule.description}
                </p>
              )}

              <div className="alert-meta">
                <span className="alert-meta-item">
                  <Tag size={14} />
                  Query: <code style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>{rule.query}</code>
                </span>
                <span className="alert-meta-item">
                  <Clock size={14} />
                  Condition: {rule.condition} for {rule.duration}
                </span>
                <span className="alert-meta-item">
                  <Clock size={14} />
                  Created: {new Date(rule.created_at).toLocaleString()}
                </span>
              </div>

              {Object.keys(rule.labels).length > 0 && (
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {Object.entries(rule.labels).map(([key, value]) => (
                    <span key={key} className="badge" style={{ fontSize: '11px' }}>
                      {key}: {value}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={confirmOpen}
        title="Delete Alert Rule"
        message="Are you sure you want to delete this alert rule? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={deleteRule}
        onCancel={cancelDelete}
      />

      {/* Edit Modal */}
      {editModalOpen && editingRule && (
        <div className="modal-overlay" onClick={closeEditModal}>
          <div className="modal" onClick={(e: React.MouseEvent) => e.stopPropagation()} style={{ maxWidth: '560px', width: '90%' }}>
            <div className="modal-header">
              <h3 className="modal-title">Edit Alert Rule</h3>
              <button onClick={closeEditModal} className="btn btn-secondary" style={{ padding: '6px' }}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Name</label>
                <input
                  type="text"
                  className="form-control"
                  value={editForm.name || ''}
                  onChange={(e: { target: { value: string } }) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="e.g. High CPU Usage"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={editForm.description || ''}
                  onChange={(e: { target: { value: string } }) => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder="What does this alert monitor?"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Query</label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={editForm.query || ''}
                  onChange={(e: { target: { value: string } }) => setEditForm({ ...editForm, query: e.target.value })}
                  placeholder="up == 1"
                  style={{ fontFamily: 'monospace', fontSize: '13px' }}
                />
                <span className="form-hint">PromQL or LogQL expression</span>
              </div>
              <div className="form-row-3">
                <div className="form-group">
                  <label className="form-label">Condition</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.condition || ''}
                    onChange={(e: { target: { value: string } }) => setEditForm({ ...editForm, condition: e.target.value })}
                    placeholder="> 80"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Duration</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.duration || ''}
                    onChange={(e: { target: { value: string } }) => setEditForm({ ...editForm, duration: e.target.value })}
                    placeholder="5m"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Severity</label>
                  <select
                    className="form-control"
                    value={editForm.severity || 'warning'}
                    onChange={(e: { target: { value: string } }) => setEditForm({ ...editForm, severity: e.target.value })}
                  >
                    <option value="critical">Critical</option>
                    <option value="warning">Warning</option>
                    <option value="info">Info</option>
                  </select>
                </div>
              </div>

              {/* AI Generation */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles size={16} color="var(--accent-primary)" />
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>AI Variants</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {providers.length > 0 && (
                      <select
                        className="form-control"
                        value={selectedProvider}
                        onChange={(e: { target: { value: string } }) => setSelectedProvider(e.target.value)}
                        style={{ width: '180px', fontSize: '13px' }}
                      >
                        {providers.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.model}){p.is_default ? ' — default' : ''}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={generateVariants}
                      disabled={generating || providers.length === 0}
                      className="btn btn-primary"
                      style={{ fontSize: '13px', padding: '6px 12px' }}
                    >
                      {generating ? (
                        <>
                          <Loader size={14} className="spinner" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Brain size={14} />
                          Generate
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {aiError && (
                  <div className="alert alert-error" style={{ fontSize: '13px', padding: '10px 12px' }}>
                    {aiError}
                  </div>
                )}

                {aiVariants.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {aiVariants.map((variant, idx) => (
                      <div
                        key={idx}
                        className="card"
                        style={{
                          cursor: 'pointer',
                          padding: '12px',
                          border: '1px solid var(--border-color)',
                          transition: 'var(--transition)',
                        }}
                        onClick={() => applyVariant(variant)}
                        onMouseEnter={(e: React.MouseEvent<HTMLDivElement>) => {
                          (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent-primary)';
                        }}
                        onMouseLeave={(e: React.MouseEvent<HTMLDivElement>) => {
                          (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-color)';
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 600, fontSize: '13px' }}>{variant.name}</span>
                          <span className="badge" style={{ fontSize: '11px', background: 'var(--bg-tertiary)' }}>
                            {variant.condition} for {variant.duration}
                          </span>
                        </div>
                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                          {variant.description}
                        </p>
                        <code style={{ fontSize: '11px', background: 'var(--bg-primary)', padding: '4px 8px', borderRadius: '4px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {variant.query}
                        </code>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={closeEditModal} className="btn btn-secondary" disabled={saving}>
                Cancel
              </button>
              <button onClick={saveEdit} className="btn btn-primary" disabled={saving}>
                {saving ? (
                  <>
                    <Loader size={16} className="spinner" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    Save Changes
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
