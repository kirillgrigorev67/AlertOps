import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  Search,
  Plus,
  Trash2,
  Edit2,
  AlertTriangle,
  Clock,
  Tag,
  Bell,
  BellOff,
  BellRing,
  X,
  Save,
  Loader,
  Brain,
  Sparkles,
  Folder,
  ChevronDown,
  ChevronRight,
  Shield,
  Check,
  FolderPlus,
} from 'lucide-react'
import api from '../api/client'
import ConfirmModal from '../components/ConfirmModal'
import ChannelSelectDropdown from '../components/ChannelSelectDropdown'

interface AlertRule {
  id: string
  name: string
  description: string
  query: string
  query_type: string
  condition: string
  duration: string
  severity: string
  folder?: string | null
  resolve_timeout?: number
  channels?: string[]
  labels: Record<string, string>
  annotations: Record<string, string>
  created_at: string
  updated_at: string
  silenced_until?: string | null
}

interface NotificationChannel {
  id: string
  name: string
  channel_type: string
  enabled: boolean
}

interface FolderInfo {
  name: string
  silenced_until?: string | null
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

const SILENCE_DURATION_OPTIONS = [
  { label: '1 hour', value: 60 },
  { label: '4 hours', value: 240 },
  { label: '24 hours', value: 1440 },
  { label: 'Until manually unsilenced', value: -1 },
]

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
  const [editResolveTimeout, setEditResolveTimeout] = useState('5m')
  const [editFolder, setEditFolder] = useState('')
  const [editSelectedChannels, setEditSelectedChannels] = useState<string[]>([])
  const [, setExistingFolders] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const [folders, setFolders] = useState<FolderInfo[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)

  const [providers, setProviders] = useState<LLMProvider[]>([])
  const [selectedProvider, setSelectedProvider] = useState('')
  const [notificationChannels, setNotificationChannels] = useState<NotificationChannel[]>([])
  const [generating, setGenerating] = useState(false)
  const [aiVariants, setAiVariants] = useState<AlertVariant[]>([])
  const [aiError, setAiError] = useState('')

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['all']))

  const [folderDropdownOpen, setFolderDropdownOpen] = useState(false)
  const [folderSearch, setFolderSearch] = useState('')
  const folderDropdownRef = useRef<HTMLDivElement>(null)

  // Folder management
  const [createFolderModalOpen, setCreateFolderModalOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [folderActionError, setFolderActionError] = useState('')
  const [editingFolderName, setEditingFolderName] = useState<string | null>(null)
  const [editFolderNameValue, setEditFolderNameValue] = useState('')
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null)
  const [deleteFolderWithAlerts, setDeleteFolderWithAlerts] = useState(false)
  const [folderDeleteError, setFolderDeleteError] = useState('')

  // Silence state
  const [silenceModalOpen, setSilenceModalOpen] = useState(false)
  const [silenceTarget, setSilenceTarget] = useState<{ type: 'rule' | 'folder'; id: string; name: string } | null>(null)
  const [silenceDuration, setSilenceDuration] = useState<number>(60)
  const [silenceLoading, setSilenceLoading] = useState(false)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (folderDropdownRef.current && !folderDropdownRef.current.contains(event.target as Node)) {
        setFolderDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)

    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    loadRules()
    loadFolders()
    loadNotificationChannels()
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

  const loadFolders = async () => {
    try {
      const data = await api.get<FolderInfo[]>('/rules/folders')
      setExistingFolders(data.map(f => f.name))
      setFolders(data)
    } catch (err) {
      console.error('Failed to load folders:', err)
    }
  }

  const loadNotificationChannels = async () => {
    try {
      const data = await api.get<NotificationChannel[]>('/notification-channels')
      setNotificationChannels(data.filter(ch => ch.enabled))
    } catch (err) {
      console.error('Failed to load notification channels:', err)
    }
  }

  const getChannelNames = (channelIds?: string[]) => {
    if (!channelIds || channelIds.length === 0) return []
    return channelIds
      .map(id => notificationChannels.find(ch => ch.id === id))
      .filter(Boolean)
      .map(ch => ch!)
  }

  const openDeleteConfirm = (id: string) => {
    setRuleToDelete(id)
    setConfirmOpen(true)
  }

  const deleteRule = async () => {
    if (!ruleToDelete) return

    try {
      await api.delete(`/rules/${ruleToDelete}`)
      setRules(rules.filter((rule: AlertRule) => rule.id !== ruleToDelete))
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

      const defaultProvider = data.find(provider => provider.is_default)

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
    setEditResolveTimeout(String(rule.resolve_timeout || 5) + 'm')
    setEditFolder(rule.folder || '')
    setEditSelectedChannels(rule.channels || [])
    setAiVariants([])
    setAiError('')
    loadProviders()
    loadFolders()
    loadNotificationChannels()
    setEditModalOpen(true)
  }

  const closeEditModal = () => {
    setEditModalOpen(false)
    setEditingRule(null)
    setEditForm({})
    setAiVariants([])
    setAiError('')
    setSelectedProvider('')
    setEditFolder('')
    setEditSelectedChannels([])
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
    setEditForm(previous => ({
      ...previous,
      name: variant.name,
      description: variant.description,
      query: variant.query,
      condition: variant.condition,
      duration: variant.duration,
    }))

    setAiVariants([])
  }

  const saveEdit = async () => {
    if (!editingRule) return

    const timeoutStr = editResolveTimeout.replace(/m$/, '').trim()
    const timeoutNum = parseInt(timeoutStr)

    if (isNaN(timeoutNum) || timeoutNum < 3) {
      setAiError('Resolve timeout must be at least 3 minutes')
      return
    }

    try {
      setSaving(true)

      const updated = await api.put<AlertRule>(`/rules/${editingRule.id}`, {
        ...editForm,
        folder: editFolder.trim() || null,
        resolve_timeout: timeoutNum,
        channels: editSelectedChannels,
      })

      setRules(rules.map((rule: AlertRule) => (rule.id === updated.id ? updated : rule)))
      await loadFolders()
      closeEditModal()
    } catch (err) {
      setError('Failed to update rule')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const filteredRules = rules.filter((rule: AlertRule) => {
    if (selectedFolder !== null) {
      if (selectedFolder === '') {
        if (rule.folder) return false
      } else if (rule.folder !== selectedFolder) {
        return false
      }
    }

    if (searchQuery === '') return true

    const query = searchQuery.toLowerCase()

    return (
      rule.name.toLowerCase().includes(query) ||
      rule.description.toLowerCase().includes(query) ||
      rule.query.toLowerCase().includes(query) ||
      (rule.folder && rule.folder.toLowerCase().includes(query))
    )
  })

  const groupRulesByFolder = (rulesList: AlertRule[], allFolders: FolderInfo[]) => {
    const groups: Record<string, AlertRule[]> = {}

    for (const folder of allFolders) {
      groups[folder.name] = []
    }

    for (const rule of rulesList) {
      if (!rule.folder) continue
      if (!groups[rule.folder]) {
        groups[rule.folder] = []
      }
      groups[rule.folder].push(rule)
    }

    return groups
  }

  const groupedRules = groupRulesByFolder(filteredRules, folders)
  const rulesWithoutFolder = filteredRules.filter((rule: AlertRule) => !rule.folder)

  const activeFolders = searchQuery
    ? folders.filter(folder => {
        const folderMatches = folder.name.toLowerCase().includes(searchQuery.toLowerCase())
        const hasMatchingRules = groupedRules[folder.name] && groupedRules[folder.name].length > 0
        return folderMatches || hasMatchingRules
      })
    : folders

  const folderKeys = activeFolders.map(f => f.name).sort()

  const toggleFolder = (folderKey: string) => {
    setExpandedFolders(previous => {
      const next = new Set(previous)

      if (next.has(folderKey)) {
        next.delete(folderKey)
      } else {
        next.add(folderKey)
      }

      return next
    })
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return '#ef4444'
      case 'warning':
        return '#f59e0b'
      case 'info':
        return '#3b82f6'
      default:
        return '#6b7280'
    }
  }

  // Folder management functions
  const handleCreateFolder = async () => {
    const name = newFolderName.trim()
    if (!name) {
      setFolderActionError('Folder name cannot be empty')
      return
    }

    setCreatingFolder(true)
    setFolderActionError('')

    try {
      await api.post('/rules/folders', { name })
      await loadFolders()
      setNewFolderName('')
      setCreateFolderModalOpen(false)
    } catch (err: any) {
      setFolderActionError(err?.message || 'Failed to create folder')
    } finally {
      setCreatingFolder(false)
    }
  }

  const handleRenameFolder = async (oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName.trim()) {
      setEditingFolderName(null)
      return
    }

    try {
      await api.post('/rules/folders/rename', { old_name: oldName, new_name: newName.trim() })
      await loadFolders()
      await loadRules()
      if (selectedFolder === oldName) {
        setSelectedFolder(newName.trim())
      }
      setEditingFolderName(null)
      setEditFolderNameValue('')
    } catch (err: any) {
      setError(err?.message || 'Failed to rename folder')
    }
  }

  const openDeleteFolderConfirm = (folderName: string) => {
    setFolderToDelete(folderName)
    setDeleteFolderWithAlerts(false)
    setFolderDeleteError('')
  }

  const deleteFolder = async () => {
    if (!folderToDelete) return

    const folderRuleCount = groupedRules[folderToDelete]?.length || 0

    if (folderRuleCount > 0 && !deleteFolderWithAlerts) {
      setFolderDeleteError(`Folder "${folderToDelete}" contains ${folderRuleCount} alert rule(s). Please confirm deletion by checking the box below.`)
      return
    }

    try {
      if (folderRuleCount > 0) {
        const rulesToDelete = groupedRules[folderToDelete]
        for (const rule of rulesToDelete) {
          await api.delete(`/rules/${rule.id}`)
        }
      }

      await api.delete(`/rules/folders/${encodeURIComponent(folderToDelete)}`)
      await loadFolders()
      await loadRules()
      if (selectedFolder === folderToDelete) {
        setSelectedFolder(null)
      }
      setFolderToDelete(null)
      setDeleteFolderWithAlerts(false)
      setFolderDeleteError('')
    } catch (err: any) {
      setError(err?.message || 'Failed to delete folder')
      setFolderToDelete(null)
      setDeleteFolderWithAlerts(false)
      setFolderDeleteError('')
    }
  }

  const cancelDeleteFolder = () => {
    setFolderToDelete(null)
    setDeleteFolderWithAlerts(false)
    setFolderDeleteError('')
  }

  // Silence helpers
  const isSilenced = (silencedUntil: string | null | undefined): boolean => {
    if (!silencedUntil) return false
    try {
      return new Date(silencedUntil) > new Date()
    } catch {
      return false
    }
  }

  const formatSilencedUntil = (silencedUntil: string | null | undefined): string => {
    if (!silencedUntil) return ''
    try {
      const dt = new Date(silencedUntil)
      return dt.toLocaleString()
    } catch {
      return silencedUntil
    }
  }

  const openSilenceModal = (type: 'rule' | 'folder', id: string, name: string) => {
    setSilenceTarget({ type, id, name })
    setSilenceDuration(60)
    setSilenceModalOpen(true)
  }

  const closeSilenceModal = () => {
    setSilenceModalOpen(false)
    setSilenceTarget(null)
    setSilenceDuration(60)
  }

  const handleSilence = async () => {
    if (!silenceTarget) return
    setSilenceLoading(true)
    try {
      const path = silenceTarget.type === 'rule'
        ? `/rules/${silenceTarget.id}/silence`
        : `/rules/folders/${encodeURIComponent(silenceTarget.id)}/silence`
      await api.post(path, { duration_minutes: silenceDuration })
      await loadRules()
      await loadFolders()
      closeSilenceModal()
    } catch (err: any) {
      setError(err?.message || 'Failed to silence')
    } finally {
      setSilenceLoading(false)
    }
  }

  const handleUnsilence = async (type: 'rule' | 'folder', id: string) => {
    try {
      const path = type === 'rule'
        ? `/rules/${id}/unsilence`
        : `/rules/folders/${encodeURIComponent(id)}/unsilence`
      await api.post(path, {})
      await loadRules()
      await loadFolders()
    } catch (err: any) {
      setError(err?.message || 'Failed to unsilence')
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
      <div className="header">
        <h1 className="page-title">
          <Shield size={28} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
          Alert Rules
        </h1>

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

      <div
        style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '16px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <select
            value={selectedFolder === null ? '__all__' : selectedFolder}
            onChange={event => {
              const value = event.target.value

              if (value === '__all__') {
                setSelectedFolder(null)
              } else {
                setSelectedFolder(value)
              }
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
            {folders.map(folder => (
              <option key={folder.name} value={folder.name}>
                {folder.name}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => {
            setNewFolderName('')
            setFolderActionError('')
            setCreateFolderModalOpen(true)
          }}
          className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '8px 12px' }}
          title="Create new folder"
        >
          <FolderPlus size={16} />
          New Folder
        </button>

        <div style={{ position: 'relative', maxWidth: '300px', width: '100%' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />

          <input
            type="text"
            placeholder="Search by name or description..."
            value={searchQuery}
            onChange={(event: { target: { value: string } }) => setSearchQuery(event.target.value)}
            style={{
              width: '100%',
              paddingLeft: '36px',
            }}
          />
        </div>
      </div>

      <div style={{ marginBottom: '16px', color: 'var(--text-muted)', fontSize: '14px' }}>
        {filteredRules.length} {filteredRules.length === 1 ? 'rule' : 'rules'}
        {(searchQuery || selectedFolder !== null) && ` (filtered from ${rules.length})`}
      </div>

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
          {rulesWithoutFolder.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                marginBottom: folderKeys.length > 0 ? '16px' : '0',
              }}
            >
              {rulesWithoutFolder.map(rule => (
                <div key={rule.id} className="alert-card">
                  <div className="alert-header">
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                      }}
                    >
                      <h3
                        className="alert-title"
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {rule.name}
                      </h3>

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

                      {getChannelNames(rule.channels).map(ch => (
                        <span
                          key={ch.id}
                          className="badge"
                          style={{
                            background: ch.channel_type === 'telegram' ? 'rgba(34, 158, 217, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                            color: ch.channel_type === 'telegram' ? '#229ed9' : '#6366f1',
                            flexShrink: 0,
                            fontSize: '11px',
                          }}
                          title={ch.name}
                        >
                          {ch.channel_type === 'telegram' ? 'TG' : 'WH'}: {ch.name}
                        </span>
                      ))}

                      {isSilenced(rule.silenced_until) && (
                        <span
                          className="badge"
                          style={{
                            background: 'rgba(245, 158, 11, 0.15)',
                            color: '#f59e0b',
                            flexShrink: 0,
                            fontSize: '11px',
                          }}
                          title={`Silenced until ${formatSilencedUntil(rule.silenced_until)}`}
                        >
                          <BellOff size={10} style={{ marginRight: '4px', display: 'inline', verticalAlign: 'middle' }} />
                          Silenced
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '4px', marginLeft: '8px', flexShrink: 0 }}>
                      {isSilenced(rule.silenced_until) ? (
                        <button
                          onClick={() => handleUnsilence('rule', rule.id)}
                          className="btn btn-secondary"
                          style={{ padding: '6px', color: '#f59e0b' }}
                          title="Unsilence rule"
                        >
                          <BellRing size={16} />
                        </button>
                      ) : (
                        <button
                          onClick={() => openSilenceModal('rule', rule.id, rule.name)}
                          className="btn btn-secondary"
                          style={{ padding: '6px' }}
                          title="Silence rule"
                        >
                          <BellOff size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => openEditModal(rule)}
                        className="btn btn-secondary"
                        style={{ padding: '6px' }}
                        title="Edit rule"
                      >
                        <Edit2 size={16} />
                      </button>

                      <button
                        onClick={() => openDeleteConfirm(rule.id)}
                        className="btn btn-secondary"
                        style={{ padding: '6px', color: '#ef4444' }}
                        title="Delete rule"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {rule.description && (
                    <p
                      style={{
                        color: 'var(--text-secondary)',
                        marginBottom: '12px',
                        fontSize: '14px',
                      }}
                    >
                      {rule.description}
                    </p>
                  )}

                  {isSilenced(rule.silenced_until) && (
                    <div
                      style={{
                        background: 'rgba(245, 158, 11, 0.08)',
                        border: '1px solid rgba(245, 158, 11, 0.2)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '8px 12px',
                        marginBottom: '12px',
                        fontSize: '13px',
                        color: '#f59e0b',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <BellOff size={14} />
                      Silenced until {formatSilencedUntil(rule.silenced_until)}
                    </div>
                  )}

                  <div className="alert-meta">
                    <span className="alert-meta-item">
                      <Tag size={14} />
                      Query:{' '}
                      <code
                        style={{
                          background: 'var(--bg-tertiary)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '12px',
                        }}
                      >
                        {rule.query}
                      </code>
                    </span>

                    <span className="alert-meta-item">
                      <Clock size={14} />
                      Condition: {rule.condition} for {rule.duration}
                    </span>

                    <span className="alert-meta-item">
                      <Clock size={14} />
                      Resolve: {rule.resolve_timeout || 5} min
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

          {folderKeys.map(folderKey => {
            const folderInfo = folders.find(f => f.name === folderKey)
            const isEmpty = groupedRules[folderKey].length === 0
            const folderSilenced = folderInfo ? isSilenced(folderInfo.silenced_until) : false
            return (
            <div key={folderKey} style={{ marginBottom: '16px', opacity: isEmpty ? 0.5 : 1 }}>
              <div
                onClick={() => !isEmpty && toggleFolder(folderKey)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 12px',
                  background: folderSilenced ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-tertiary)',
                  border: folderSilenced ? '1px solid rgba(245, 158, 11, 0.2)' : '1px solid transparent',
                  borderRadius: 'var(--radius-sm)',
                  cursor: isEmpty ? 'default' : 'pointer',
                  marginBottom: '8px',
                  userSelect: 'none',
                }}
              >
                {isEmpty ? (
                  <ChevronRight size={16} color="var(--text-muted)" style={{ opacity: 0.3 }} />
                ) : expandedFolders.has(folderKey) ? (
                  <ChevronDown size={16} color="var(--text-muted)" />
                ) : (
                  <ChevronRight size={16} color="var(--text-muted)" />
                )}

                <Folder size={16} color={isEmpty ? 'var(--text-muted)' : folderSilenced ? '#f59e0b' : 'var(--accent-primary)'} />

                {editingFolderName === folderKey ? (
                  <input
                    type="text"
                    autoFocus
                    value={editFolderNameValue}
                    onChange={(e) => setEditFolderNameValue(e.target.value)}
                    onBlur={() => handleRenameFolder(folderKey, editFolderNameValue)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameFolder(folderKey, editFolderNameValue)
                      if (e.key === 'Escape') {
                        setEditingFolderName(null)
                        setEditFolderNameValue('')
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      flex: 1,
                      background: 'var(--surface)',
                      border: '1px solid var(--accent-primary)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '4px 8px',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      fontWeight: 600,
                      outline: 'none',
                    }}
                  />
                ) : (
                  <span style={{ fontWeight: 600, fontSize: '14px', flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {folderKey}
                    {folderSilenced && (
                      <span
                        className="badge"
                        style={{
                          background: 'rgba(245, 158, 11, 0.15)',
                          color: '#f59e0b',
                          fontSize: '11px',
                        }}
                      >
                        <BellOff size={10} style={{ marginRight: '4px', display: 'inline', verticalAlign: 'middle' }} />
                        Silenced
                      </span>
                    )}
                  </span>
                )}

                <span
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    background: 'var(--bg-primary)',
                    padding: '2px 8px',
                    borderRadius: '10px',
                  }}
                >
                  {groupedRules[folderKey].length}
                </span>

                {editingFolderName !== folderKey && (
                  <div style={{ display: 'flex', gap: '4px', marginLeft: '4px' }}>
                    {folderSilenced ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleUnsilence('folder', folderKey)
                        }}
                        className="btn btn-secondary"
                        style={{ padding: '4px', color: '#f59e0b', opacity: 0.7 }}
                        title="Unsilence folder"
                      >
                        <BellRing size={14} />
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          openSilenceModal('folder', folderKey, folderKey)
                        }}
                        className="btn btn-secondary"
                        style={{ padding: '4px', opacity: 0.6 }}
                        title="Silence folder"
                      >
                        <BellOff size={14} />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditFolderNameValue(folderKey)
                        setEditingFolderName(folderKey)
                      }}
                      className="btn btn-secondary"
                      style={{ padding: '4px', opacity: 0.6 }}
                      title="Rename folder"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        openDeleteFolderConfirm(folderKey)
                      }}
                      className="btn btn-secondary"
                      style={{ padding: '4px', color: '#ef4444', opacity: 0.6 }}
                      title="Delete folder"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              {expandedFolders.has(folderKey) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {groupedRules[folderKey].map(rule => (
                    <div key={rule.id} className="alert-card">
                      <div className="alert-header">
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            flex: 1,
                            minWidth: 0,
                            overflow: 'hidden',
                          }}
                        >
                          <h3
                            className="alert-title"
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {rule.name}
                          </h3>

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

                          {getChannelNames(rule.channels).map(ch => (
                            <span
                              key={ch.id}
                              className="badge"
                              style={{
                                background: ch.channel_type === 'telegram' ? 'rgba(34, 158, 217, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                                color: ch.channel_type === 'telegram' ? '#229ed9' : '#6366f1',
                                flexShrink: 0,
                                fontSize: '11px',
                              }}
                              title={ch.name}
                            >
                              {ch.channel_type === 'telegram' ? 'TG' : 'WH'}: {ch.name}
                            </span>
                          ))}

                          {isSilenced(rule.silenced_until) && (
                            <span
                              className="badge"
                              style={{
                                background: 'rgba(245, 158, 11, 0.15)',
                                color: '#f59e0b',
                                flexShrink: 0,
                                fontSize: '11px',
                              }}
                              title={`Silenced until ${formatSilencedUntil(rule.silenced_until)}`}
                            >
                              <BellOff size={10} style={{ marginRight: '4px', display: 'inline', verticalAlign: 'middle' }} />
                              Silenced
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: '4px', marginLeft: '8px', flexShrink: 0 }}>
                          {isSilenced(rule.silenced_until) ? (
                            <button
                              onClick={() => handleUnsilence('rule', rule.id)}
                              className="btn btn-secondary"
                              style={{ padding: '6px', color: '#f59e0b' }}
                              title="Unsilence rule"
                            >
                              <BellRing size={16} />
                            </button>
                          ) : (
                            <button
                              onClick={() => openSilenceModal('rule', rule.id, rule.name)}
                              className="btn btn-secondary"
                              style={{ padding: '6px' }}
                              title="Silence rule"
                            >
                              <BellOff size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => openEditModal(rule)}
                            className="btn btn-secondary"
                            style={{ padding: '6px' }}
                            title="Edit rule"
                          >
                            <Edit2 size={16} />
                          </button>

                          <button
                            onClick={() => openDeleteConfirm(rule.id)}
                            className="btn btn-secondary"
                            style={{ padding: '6px', color: '#ef4444' }}
                            title="Delete rule"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      {rule.description && (
                        <p
                          style={{
                            color: 'var(--text-secondary)',
                            marginBottom: '12px',
                            fontSize: '14px',
                          }}
                        >
                          {rule.description}
                        </p>
                      )}

                      {isSilenced(rule.silenced_until) && (
                        <div
                          style={{
                            background: 'rgba(245, 158, 11, 0.08)',
                            border: '1px solid rgba(245, 158, 11, 0.2)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '8px 12px',
                            marginBottom: '12px',
                            fontSize: '13px',
                            color: '#f59e0b',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          <BellOff size={14} />
                          Silenced until {formatSilencedUntil(rule.silenced_until)}
                        </div>
                      )}

                      <div className="alert-meta">
                        <span className="alert-meta-item">
                          <Tag size={14} />
                          Query:{' '}
                          <code
                            style={{
                              background: 'var(--bg-tertiary)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '12px',
                            }}
                          >
                            {rule.query}
                          </code>
                        </span>

                        <span className="alert-meta-item">
                          <Clock size={14} />
                          Condition: {rule.condition} for {rule.duration}
                        </span>

                        <span className="alert-meta-item">
                          <Clock size={14} />
                          Resolve: {rule.resolve_timeout || 5} min
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
            </div>
            )
          })}
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

      {/* Delete Folder Modal */}
      {!!folderToDelete && (
        <div
          className="modal-overlay"
          onClick={cancelDeleteFolder}
        >
          <div
            className="modal"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            style={{ maxWidth: '420px', width: '90%' }}
          >
            <div className="modal-header">
              <h3 className="modal-title">Delete Folder</h3>
              <button
                onClick={cancelDeleteFolder}
                className="btn btn-secondary"
                style={{ padding: '6px' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                Are you sure you want to delete folder "{folderToDelete}"?
              </p>

              {groupedRules[folderToDelete] && groupedRules[folderToDelete].length > 0 && (
                <div
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <AlertTriangle size={16} color="#ef4444" />
                    <span style={{ color: '#ef4444', fontWeight: 600, fontSize: '13px' }}>
                      Warning: {groupedRules[folderToDelete].length} alert rule(s) will be permanently deleted
                    </span>
                  </div>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={deleteFolderWithAlerts}
                      onChange={(e) => {
                        setDeleteFolderWithAlerts(e.target.checked)
                        setFolderDeleteError('')
                      }}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    I understand and want to delete this folder and all its alert rules
                  </label>
                </div>
              )}

              {folderDeleteError && (
                <div className="alert alert-error" style={{ fontSize: '13px', padding: '10px 12px' }}>
                  {folderDeleteError}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                onClick={cancelDeleteFolder}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={deleteFolder}
                className="btn"
                style={{
                  backgroundColor: '#ef4444',
                  color: '#fff',
                }}
              >
                <Trash2 size={16} />
                Delete Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Folder Modal */}
      {createFolderModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => setCreateFolderModalOpen(false)}
        >
          <div
            className="modal"
            onClick={(event: React.MouseEvent) => event.stopPropagation()}
            style={{ maxWidth: '400px', width: '90%' }}
          >
            <div className="modal-header">
              <h3 className="modal-title">Create New Folder</h3>
              <button
                onClick={() => setCreateFolderModalOpen(false)}
                className="btn btn-secondary"
                style={{ padding: '6px' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Folder Name</label>
                <input
                  type="text"
                  className="form-control"
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => {
                    setNewFolderName(e.target.value)
                    setFolderActionError('')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateFolder()
                    if (e.key === 'Escape') setCreateFolderModalOpen(false)
                  }}
                  placeholder="e.g. Production"
                />
              </div>

              {folderActionError && (
                <div className="alert alert-error" style={{ fontSize: '13px', padding: '10px 12px' }}>
                  {folderActionError}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                onClick={() => setCreateFolderModalOpen(false)}
                className="btn btn-secondary"
                disabled={creatingFolder}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                className="btn btn-primary"
                disabled={creatingFolder || !newFolderName.trim()}
              >
                {creatingFolder ? (
                  <>
                    <Loader size={16} className="spinner" />
                    Creating...
                  </>
                ) : (
                  <>
                    <FolderPlus size={16} />
                    Create Folder
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Silence Modal */}
      {silenceModalOpen && silenceTarget && (
        <div className="modal-overlay" onClick={closeSilenceModal}>
          <div
            className="modal"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            style={{ maxWidth: '420px', width: '90%' }}
          >
            <div className="modal-header">
              <h3 className="modal-title">
                <BellOff size={20} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                Silence {silenceTarget.type === 'folder' ? 'Folder' : 'Rule'}
              </h3>
              <button onClick={closeSilenceModal} className="btn btn-secondary" style={{ padding: '6px' }}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                Silence <strong>{silenceTarget.name}</strong>. Silenced alerts will not create notifications but will remain visible in the UI.
              </p>

              <div className="form-group">
                <label className="form-label">Duration</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {SILENCE_DURATION_OPTIONS.map(option => (
                    <label
                      key={option.value}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-sm)',
                        border: silenceDuration === option.value ? '1px solid var(--accent-primary)' : '1px solid var(--border)',
                        background: silenceDuration === option.value ? 'rgba(99, 102, 241, 0.08)' : 'var(--surface)',
                        cursor: 'pointer',
                        fontSize: '14px',
                      }}
                    >
                      <input
                        type="radio"
                        name="silenceDuration"
                        value={option.value}
                        checked={silenceDuration === option.value}
                        onChange={() => setSilenceDuration(option.value)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={closeSilenceModal} className="btn btn-secondary" disabled={silenceLoading}>
                Cancel
              </button>
              <button
                onClick={handleSilence}
                className="btn btn-primary"
                disabled={silenceLoading}
                style={{ backgroundColor: '#f59e0b', borderColor: '#f59e0b' }}
              >
                {silenceLoading ? (
                  <>
                    <Loader size={16} className="spinner" />
                    Silencing...
                  </>
                ) : (
                  <>
                    <BellOff size={16} />
                    Silence
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {editModalOpen && editingRule && (
        <div className="modal-overlay" onClick={closeEditModal}>
          <div
            className="modal"
            onClick={(event: React.MouseEvent) => event.stopPropagation()}
            style={{ maxWidth: '560px', width: '90%' }}
          >
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
                  onChange={(event: { target: { value: string } }) =>
                    setEditForm({ ...editForm, name: event.target.value })
                  }
                  placeholder="e.g. High CPU Usage"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>

                <textarea
                  className="form-control"
                  rows={2}
                  value={editForm.description || ''}
                  onChange={(event: { target: { value: string } }) =>
                    setEditForm({ ...editForm, description: event.target.value })
                  }
                  placeholder="What does this alert monitor?"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Query</label>

                <textarea
                  className="form-control"
                  rows={3}
                  value={editForm.query || ''}
                  onChange={(event: { target: { value: string } }) =>
                    setEditForm({ ...editForm, query: event.target.value })
                  }
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
                    onChange={(event: { target: { value: string } }) =>
                      setEditForm({ ...editForm, condition: event.target.value })
                    }
                    placeholder="> 80"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Duration</label>

                  <input
                    type="text"
                    className="form-control"
                    value={editForm.duration || ''}
                    onChange={(event: { target: { value: string } }) =>
                      setEditForm({ ...editForm, duration: event.target.value })
                    }
                    placeholder="5m"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Severity</label>

                  <select
                    className="form-control"
                    value={editForm.severity || 'warning'}
                    onChange={(event: { target: { value: string } }) =>
                      setEditForm({ ...editForm, severity: event.target.value })
                    }
                  >
                    <option value="critical">Critical</option>
                    <option value="warning">Warning</option>
                    <option value="info">Info</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Resolve Timeout</label>

                  <input
                    type="text"
                    className="form-control"
                    value={editResolveTimeout}
                    onChange={(event: { target: { value: string } }) => setEditResolveTimeout(event.target.value)}
                    placeholder="5m"
                  />

                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>minutes</div>
                </div>
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '-8px' }}>
                Resolve timeout: delay before closing the alert after metric recovery. Prevents flapping.
              </div>

              <div className="form-group" style={{ position: 'relative' }} ref={folderDropdownRef}>
                <label className="form-label">Folder</label>

                <div
                  onClick={() => setFolderDropdownOpen(!folderDropdownOpen)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: editFolder ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontSize: '14px',
                    cursor: 'pointer',
                    minHeight: '40px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Folder size={16} color="var(--text-muted)" />
                    <span>{editFolder || 'None'}</span>
                  </div>

                  <ChevronDown size={16} color="var(--text-muted)" />
                </div>

                {folderDropdownOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      marginTop: '4px',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                      zIndex: 9999,
                      maxHeight: '300px',
                      overflow: 'auto',
                    }}
                  >
                    <div style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
                      <input
                        type="text"
                        placeholder="Search or create folder..."
                        value={folderSearch}
                        onChange={event => setFolderSearch(event.target.value)}
                        onClick={event => event.stopPropagation()}
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          fontSize: '13px',
                        }}
                        autoFocus
                      />
                    </div>

                    <div
                      onClick={() => {
                        setEditFolder('')
                        setFolderDropdownOpen(false)
                        setFolderSearch('')
                      }}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        borderBottom: '1px solid var(--border)',
                        background: editFolder === '' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                      }}
                    >
                      <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>None</span>

                      {editFolder === '' && (
                        <Check size={14} color="var(--accent-primary)" style={{ marginLeft: 'auto' }} />
                      )}
                    </div>

                    <div>
                      {folders
                        .filter(folder => folder.name.toLowerCase().includes(folderSearch.toLowerCase()))
                        .map(folder => (
                          <div
                            key={folder.name}
                            onClick={() => {
                              setEditFolder(folder.name)
                              setFolderDropdownOpen(false)
                              setFolderSearch('')
                            }}
                            style={{
                              padding: '8px 12px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              background: editFolder === folder.name ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                            }}
                          >
                            <Folder size={14} color="var(--text-muted)" />
                            <span style={{ fontSize: '13px' }}>{folder.name}</span>

                            {editFolder === folder.name && (
                              <Check size={14} color="var(--accent-primary)" style={{ marginLeft: 'auto' }} />
                            )}
                          </div>
                        ))}

                      {folders.filter(folder => folder.name.toLowerCase().includes(folderSearch.toLowerCase())).length === 0 &&
                        folderSearch.trim() && (
                          <div style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '13px' }}>
                            No matching folders
                          </div>
                        )}
                    </div>

                    {folderSearch.trim() && !folders.some(f => f.name === folderSearch.trim()) && (
                      <div
                        style={{
                          padding: '8px 12px',
                          borderTop: '1px solid var(--border)',
                          background: 'rgba(99, 102, 241, 0.05)',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setEditFolder(folderSearch.trim())
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

              {/* Notification Channels */}
              {notificationChannels.length > 0 && (
                <ChannelSelectDropdown
                  channels={notificationChannels}
                  selectedIds={editSelectedChannels}
                  onChange={setEditSelectedChannels}
                />
              )}

              <div
                style={{
                  borderTop: '1px solid var(--border-color)',
                  paddingTop: '16px',
                  marginTop: '8px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles size={16} color="var(--accent-primary)" />
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>AI Variants</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {providers.length > 0 && (
                      <select
                        className="form-control"
                        value={selectedProvider}
                        onChange={(event: { target: { value: string } }) => setSelectedProvider(event.target.value)}
                        style={{ width: '180px', fontSize: '13px' }}
                      >
                        {providers.map(provider => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name} ({provider.model})
                            {provider.is_default ? ' — default' : ''}
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
                  <div
                    className="alert alert-error"
                    style={{ fontSize: '13px', padding: '10px 12px', color: '#ef4444' }}
                  >
                    {aiError}
                  </div>
                )}

                {aiVariants.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {aiVariants.map((variant, index) => (
                      <div
                        key={index}
                        className="card"
                        style={{
                          cursor: 'pointer',
                          padding: '12px',
                          border: '1px solid var(--border-color)',
                          transition: 'var(--transition)',
                        }}
                        onClick={() => applyVariant(variant)}
                        onMouseEnter={(event: React.MouseEvent<HTMLDivElement>) => {
                          event.currentTarget.style.borderColor = 'var(--accent-primary)'
                        }}
                        onMouseLeave={(event: React.MouseEvent<HTMLDivElement>) => {
                          event.currentTarget.style.borderColor = 'var(--border-color)'
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            marginBottom: '4px',
                          }}
                        >
                          <span style={{ fontWeight: 600, fontSize: '13px' }}>{variant.name}</span>

                          <span className="badge" style={{ fontSize: '11px', background: 'var(--bg-tertiary)' }}>
                            {variant.condition} for {variant.duration}
                          </span>
                        </div>

                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                          {variant.description}
                        </p>

                        <code
                          style={{
                            fontSize: '11px',
                            background: 'var(--bg-primary)',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            display: 'block',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
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