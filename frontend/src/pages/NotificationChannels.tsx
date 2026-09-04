import { useState, useEffect } from 'react'
import { Radio, Plus, Trash2, Edit2, Send, Loader, Check, X, Tag, Globe, MessageSquare, Bell, Search } from 'lucide-react'
import api from '../api/client'
import ConfirmModal from '../components/ConfirmModal'

interface NotificationChannel {
  id: string
  name: string
  channel_type: 'telegram' | 'webhook'
  enabled: boolean
  config: Record<string, string>
  created_at: string
  updated_at: string
}

export default function NotificationChannels() {
  const [channels, setChannels] = useState<NotificationChannel[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingChannel, setEditingChannel] = useState<NotificationChannel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  // Delete confirmation
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [channelToDelete, setChannelToDelete] = useState<string | null>(null)

  // Test sending
  const [testingIds, setTestingIds] = useState<Set<string>>(new Set())
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({})

  // Form state
  const [name, setName] = useState('')
  const [channelType, setChannelType] = useState<'telegram' | 'webhook'>('telegram')
  const [enabled, setEnabled] = useState(true)

  // Telegram config
  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState('')

  // Webhook config
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookMethod, setWebhookMethod] = useState('POST')

  useEffect(() => {
    loadChannels()
  }, [])

  const loadChannels = async () => {
    try {
      setLoading(true)
      const data = await api.get<NotificationChannel[]>('/notification-channels')
      setChannels(data)
      setError(null)
    } catch (err) {
      setError('Failed to load notification channels')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setName('')
    setChannelType('telegram')
    setEnabled(true)
    setBotToken('')
    setChatId('')
    setWebhookUrl('')
    setWebhookMethod('POST')
    setEditingChannel(null)
    setError(null)
  }

  const openAddModal = () => {
    resetForm()
    setModalOpen(true)
  }

  const openEditModal = (channel: NotificationChannel) => {
    setEditingChannel(channel)
    setName(channel.name)
    setChannelType(channel.channel_type)
    setEnabled(channel.enabled)

    if (channel.channel_type === 'telegram') {
      setBotToken(channel.config?.bot_token || '')
      setChatId(channel.config?.chat_id || '')
    } else {
      setWebhookUrl(channel.config?.url || '')
      setWebhookMethod(channel.config?.method || 'POST')
    }

    setError(null)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    resetForm()
  }

  const validateForm = () => {
    if (!name.trim()) return 'Name is required'

    if (channelType === 'telegram') {
      if (!botToken.trim()) return 'Bot token is required'
      if (!chatId.trim()) return 'Chat ID is required'
    } else {
      if (!webhookUrl.trim()) return 'Webhook URL is required'
    }

    return null
  }

  const buildConfig = (): Record<string, string> => {
    if (channelType === 'telegram') {
      return {
        bot_token: botToken.trim(),
        chat_id: chatId.trim(),
      }
    } else {
      return {
        url: webhookUrl.trim(),
        method: webhookMethod,
      }
    }
  }

  const saveChannel = async () => {
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    setError(null)

    try {
      const payload = {
        id: editingChannel ? editingChannel.id : undefined,
        name,
        channel_type: channelType,
        enabled,
        config: buildConfig(),
      }

      if (editingChannel) {
        await api.put(`/notification-channels/${editingChannel.id}`, payload)
      } else {
        await api.post('/notification-channels', payload)
      }

      closeModal()
      loadChannels()
    } catch (err: any) {
      const msg = err?.message || 'Failed to save channel'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const openDeleteConfirm = (id: string) => {
    setChannelToDelete(id)
    setConfirmOpen(true)
  }

  const confirmDelete = async () => {
    if (!channelToDelete) return
    try {
      await api.delete(`/notification-channels/${channelToDelete}`)
      setConfirmOpen(false)
      setChannelToDelete(null)
      loadChannels()
    } catch (err) {
      console.error('Failed to delete channel:', err)
    }
  }

  const cancelDelete = () => {
    setConfirmOpen(false)
    setChannelToDelete(null)
  }

  const testChannel = async (channelId: string) => {
    setTestingIds(prev => new Set(prev).add(channelId))
    setTestResults(prev => {
      const next = { ...prev }
      delete next[channelId]
      return next
    })

    try {
      await api.post(`/notification-channels/${channelId}/test`, {})
      setTestResults(prev => ({
        ...prev,
        [channelId]: { success: true, message: 'Test notification sent successfully' },
      }))
    } catch (err: any) {
      setTestResults(prev => ({
        ...prev,
        [channelId]: { success: false, message: err?.message || 'Failed to send test notification' },
      }))
    } finally {
      setTestingIds(prev => {
        const next = new Set(prev)
        next.delete(channelId)
        return next
      })
    }
  }

  const getChannelLabel = (type: string) => {
    return type === 'telegram' ? 'Telegram' : 'Webhook'
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
      </div>
    )
  }

  const filteredChannels = channels.filter(channel => {
    if (search === '') return true
    const term = search.toLowerCase()
    return channel.name.toLowerCase().includes(term)
  })

  return (
    <div>
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <h1 className="page-title">
          <Radio size={28} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
          Notification Channels
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
              placeholder="Search channels..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ 
                width: '100%', 
                paddingLeft: '36px',
              }}
            />
          </div>
          <button className="btn btn-primary" onClick={openAddModal}>
            <Plus size={18} />
            Add Channel
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredChannels.map(channel => (
          <div key={channel.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <h3
                  style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {channel.name}
                </h3>
                <span
                  className="badge"
                  style={{
                    background: channel.channel_type === 'telegram' ? 'rgba(34, 158, 217, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                    color: channel.channel_type === 'telegram' ? '#229ed9' : '#6366f1',
                    flexShrink: 0,
                  }}
                >
                  {channel.channel_type === 'telegram' ? (
                    <MessageSquare size={10} style={{ marginRight: '4px', display: 'inline', verticalAlign: 'middle' }} />
                  ) : (
                    <Globe size={10} style={{ marginRight: '4px', display: 'inline', verticalAlign: 'middle' }} />
                  )}
                  {getChannelLabel(channel.channel_type)}
                </span>
                {!channel.enabled && (
                  <span
                    className="badge"
                    style={{
                      background: 'rgba(107,114,128,0.2)',
                      color: 'var(--text-muted)',
                      flexShrink: 0,
                      fontSize: '11px',
                    }}
                  >
                    Disabled
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '4px', marginLeft: '8px', flexShrink: 0 }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => testChannel(channel.id)}
                  disabled={testingIds.has(channel.id)}
                  title="Test channel"
                  style={{ padding: '6px' }}
                >
                  {testingIds.has(channel.id) ? (
                    <Loader size={16} className="spinner" />
                  ) : (
                    <Send size={16} />
                  )}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => openEditModal(channel)}
                  title="Edit channel"
                  style={{ padding: '6px' }}
                >
                  <Edit2 size={16} />
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => openDeleteConfirm(channel.id)}
                  title="Delete"
                  style={{ padding: '6px', color: '#ef4444' }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {testResults[channel.id] && (
              <div
                style={{
                  marginBottom: '12px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: testResults[channel.id].success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  color: testResults[channel.id].success ? 'var(--success)' : 'var(--error)',
                }}
              >
                {testResults[channel.id].success ? <Check size={14} /> : <X size={14} />}
                {testResults[channel.id].message}
              </div>
            )}

            <div className="alert-meta" style={{ marginTop: 0 }}>
              <span className="alert-meta-item">
                <Tag size={14} />
                Type: {getChannelLabel(channel.channel_type)}
              </span>
              {channel.channel_type === 'telegram' ? (
                <>
                  <span className="alert-meta-item">
                    <MessageSquare size={14} />
                    Chat: {channel.config?.chat_id || 'Not set'}
                  </span>
                  <span className="alert-meta-item">
                    <Globe size={14} />
                    Token: {channel.config?.bot_token ? '••••••••' : 'Not set'}
                  </span>
                </>
              ) : (
                <>
                  <span className="alert-meta-item">
                    <Globe size={14} />
                    URL: {channel.config?.url || 'Not set'}
                  </span>
                  <span className="alert-meta-item">
                    <Tag size={14} />
                    Method: {channel.config?.method || 'POST'}
                  </span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {filteredChannels.length === 0 && !loading && (
        <div className="empty-state">
          <Bell size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
          <h3 style={{ marginBottom: '8px' }}>
            {search ? 'No channels match your search' : 'No notification channels'}
          </h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
            {search ? 'Try a different search term' : 'Create a channel to receive alerts via Telegram or Webhook'}
          </p>
          {!search && (
            <button className="btn btn-primary" onClick={openAddModal}>
              <Plus size={18} />
              Add Channel
            </button>
          )}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {editingChannel ? 'Edit Channel' : 'Add Notification Channel'}
              </h2>
              <button className="btn btn-secondary" onClick={closeModal} style={{ padding: '6px' }}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {error && (
                <div className="alert alert-error" style={{ marginBottom: '16px' }}>
                  {error}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Channel Name</label>
                <input
                  className="form-input"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g., Team Telegram"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Channel Type</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className={`btn ${channelType === 'telegram' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setChannelType('telegram')}
                    style={{ flex: 1 }}
                  >
                    Telegram
                  </button>
                  <button
                    className={`btn ${channelType === 'webhook' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setChannelType('webhook')}
                    style={{ flex: 1 }}
                  >
                    Webhook
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={e => setEnabled(e.target.checked)}
                  />
                  Enabled
                </label>
              </div>

              {channelType === 'telegram' ? (
                <>
                  <div className="form-group">
                    <label className="form-label">Bot Token</label>
                    <input
                      className="form-input"
                      type="password"
                      value={botToken}
                      onChange={e => setBotToken(e.target.value)}
                      placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Chat ID</label>
                    <input
                      className="form-input"
                      type="text"
                      value={chatId}
                      onChange={e => setChatId(e.target.value)}
                      placeholder="-1001234567890 or @channelusername"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label className="form-label">Webhook URL</label>
                    <input
                      className="form-input"
                      type="url"
                      value={webhookUrl}
                      onChange={e => setWebhookUrl(e.target.value)}
                      placeholder="https://hooks.slack.com/services/..."
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">HTTP Method</label>
                    <select
                      className="form-input"
                      value={webhookMethod}
                      onChange={e => setWebhookMethod(e.target.value)}
                    >
                      <option value="POST">POST</option>
                      <option value="GET">GET</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeModal}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={saveChannel}
                disabled={saving}
              >
                {saving ? <Loader size={16} className="spinner" /> : <Check size={16} />}
                {saving ? 'Saving...' : (editingChannel ? 'Update' : 'Create')}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmOpen}
        title="Delete Channel"
        message="Are you sure you want to delete this notification channel? It will be removed from all alert rules."
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </div>
  )
}