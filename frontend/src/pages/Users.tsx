import { useState, useEffect, useRef, useCallback } from 'react'
import { UserPlus, Trash2, Key, User as UserIcon, Loader, X, Folder, Search, Check, ChevronDown, Plus, Edit2 } from 'lucide-react'
import api, { type User } from '../api/client'
import ConfirmModal from '../components/ConfirmModal'

interface FolderInfo {
  name: string
}

// Multi-select dropdown with search and create-new option
function FolderMultiSelect({
  folders,
  selected,
  onChange,
}: {
  folders: FolderInfo[]
  selected: string[]
  onChange: (folders: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dropdownUp, setDropdownUp] = useState(false)

  const filtered = folders.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase())
  )

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Focus search input when opened and check if dropdown should open up
  useEffect(() => {
    if (open) {
      if (inputRef.current) {
        inputRef.current.focus()
      }
      // Check if there's enough space below, if not open upward
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const spaceBelow = window.innerHeight - rect.bottom
        setDropdownUp(spaceBelow < 300)
      }
    }
  }, [open])

  const toggle = useCallback((name: string) => {
    if (selected.includes(name)) {
      onChange(selected.filter(f => f !== name))
    } else {
      onChange([...selected, name])
    }
  }, [selected, onChange])

  const createNew = () => {
    const name = search.trim()
    if (!name) return
    if (!folders.some(f => f.name === name) && !selected.includes(name)) {
      onChange([...selected, name])
    }
    setSearch('')
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Trigger */}
      <div
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          padding: '10px 12px',
          background: 'var(--bg-tertiary)',
          border: `1px solid ${open ? '#6366f1' : 'var(--border-color)'}`,
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text-primary)',
          fontSize: '14px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: '40px',
          transition: 'border-color 0.15s ease',
        }}
      >
        <span style={{ color: selected.length > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
          {selected.length > 0 ? `${selected.length} folder(s) selected` : 'Select folders...'}
        </span>
        <ChevronDown size={16} style={{ 
          color: 'var(--text-muted)', 
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s ease'
        }} />
      </div>

      {/* Selected tags */}
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
          {selected.map(name => (
            <span
              key={name}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                background: 'rgba(99, 102, 241, 0.15)',
                color: '#a5b4fc',
                borderRadius: '16px',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              <Folder size={12} />
              {name}
              <X size={14} style={{ cursor: 'pointer', opacity: 0.7 }} onClick={(e) => { e.stopPropagation(); toggle(name) }} />
            </span>
          ))}
        </div>
      )}

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: 'absolute',
            ...(dropdownUp ? { bottom: '100%' } : { top: '100%' }),
            left: 0,
            right: 0,
            zIndex: 1000,
            ...(dropdownUp ? { marginBottom: '4px' } : { marginTop: '4px' }),
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            overflow: 'hidden',
          }}
        >
          {/* Search input */}
          <div style={{ padding: '10px', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    createNew()
                  }
                  if (e.key === 'Escape') {
                    setOpen(false)
                  }
                }}
                placeholder="Search or type new folder..."
                style={{
                  width: '100%',
                  padding: '9px 10px 9px 30px',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Options */}
          <div style={{ maxHeight: '180px', overflowY: 'auto', padding: '4px 0' }}>
            {filtered.length === 0 && !search.trim() && (
              <div style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center' }}>
                No folders yet. Type a name above to create one.
              </div>
            )}
            {filtered.length === 0 && search.trim() && (
              <div
                onClick={createNew}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  color: '#a5b4fc',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(99, 102, 241, 0.15)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <Plus size={14} />
                Create "{search.trim()}"
              </div>
            )}
            {filtered.map(folder => {
              const isSelected = selected.includes(folder.name)
              return (
                <div
                  key={folder.name}
                  onClick={() => toggle(folder.name)}
                  style={{
                    padding: '9px 14px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: isSelected ? '#a5b4fc' : 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: isSelected ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                    fontWeight: isSelected ? 500 : 400,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = isSelected ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255,255,255,0.04)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = isSelected ? 'rgba(99, 102, 241, 0.12)' : 'transparent')}
                >
                  <span>{folder.name}</span>
                  {isSelected && <Check size={15} color="#a5b4fc" />}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Users() {
  const [users, setUsers] = useState<User[]>([])
  const [folders, setFolders] = useState<FolderInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  
  // Create user form
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user')
  const [newFolders, setNewFolders] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  
  // Reset password modal
  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetting, setResetting] = useState(false)
  
  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  
  // Edit user modal (username, role, active, folders)
  const [editUserTarget, setEditUserTarget] = useState<User | null>(null)
  const [editUsername, setEditUsername] = useState('')
  const [editRole, setEditRole] = useState<'admin' | 'user'>('user')
  const [editActive, setEditActive] = useState(true)
  const [editFolders, setEditFolders] = useState<string[]>([])
  const [savingUser, setSavingUser] = useState(false)

  const loadUsers = async () => {
    try {
      const data = await api.users.list()
      setUsers(data)
    } catch (err: any) {
      setError(err.message || 'Failed to load users')
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

  useEffect(() => {
    loadUsers()
    loadFolders()
  }, [])

  const handleCreate = async () => {
    if (!newUsername || !newPassword) {
      setError('Username and password are required')
      return
    }
    
    setCreating(true)
    setError('')
    try {
      await api.users.create({ 
        username: newUsername, 
        password: newPassword, 
        role: newRole,
        folders: newRole === 'user' ? newFolders : []
      })
      setShowCreateModal(false)
      setNewUsername('')
      setNewPassword('')
      setNewRole('user')
      setNewFolders([])
      await loadUsers()
    } catch (err: any) {
      setError(err.message || 'Failed to create user')
    } finally {
      setCreating(false)
    }
  }

  const handleResetPassword = async () => {
    if (!resetTarget || !resetPassword) return
    
    setResetting(true)
    try {
      await api.users.update(resetTarget.id, { password: resetPassword })
      setResetTarget(null)
      setResetPassword('')
    } catch (err: any) {
      setError(err.message || 'Failed to reset password')
    } finally {
      setResetting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    
    try {
      await api.users.delete(deleteTarget.id)
      setDeleteTarget(null)
      await loadUsers()
    } catch (err: any) {
      setError(err.message || 'Failed to delete user')
    }
  }

  const openEditUserModal = (user: User) => {
    setEditUserTarget(user)
    setEditUsername(user.username)
    setEditRole(user.role as 'admin' | 'user')
    setEditActive(user.active)
    setEditFolders(user.folders || [])
  }

  const saveUser = async () => {
    if (!editUserTarget || !editUsername.trim()) return
    
    setSavingUser(true)
    setError('')
    try {
      await api.users.update(editUserTarget.id, {
        username: editUsername.trim(),
        role: editRole,
        active: editActive,
        folders: editRole === 'user' ? editFolders : []
      })
      setEditUserTarget(null)
      await loadUsers()
    } catch (err: any) {
      setError(err.message || 'Failed to update user')
    } finally {
      setSavingUser(false)
    }
  }

  return (
    <div>
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <h1 className="page-title">
          <UserIcon size={28} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
          Users
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ position: 'relative', width: '260px' }}>
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
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                paddingLeft: '36px',
              }}
            />
          </div>
          <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
            <UserPlus size={16} /> New User
          </button>
        </div>
      </div>

      {error && (
        <div style={{ color: 'var(--error)', fontSize: '13px', marginBottom: '16px', padding: '8px 12px', background: 'rgba(220, 38, 38, 0.1)', borderRadius: 'var(--radius-sm)' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '20px', color: 'var(--text-muted)' }}>
          <Loader size={16} className="spinner" /> Loading users...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {users
            .filter(user => 
              searchQuery === '' || 
              user.username.toLowerCase().includes(searchQuery.toLowerCase())
            )
            .map((user) => (
            <div key={user.id} className="card">
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
                    {user.username}
                    {user.is_default && (
                      <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>(default)</span>
                    )}
                  </h3>
                  <span className="badge" style={{ 
                    background: user.role === 'admin' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(59, 130, 246, 0.15)', 
                    color: user.role === 'admin' ? '#6366f1' : '#3b82f6',
                    flexShrink: 0 
                  }}>
                    {user.role}
                  </span>
                  <span className="badge" style={{ 
                    background: user.active ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)', 
                    color: user.active ? 'var(--success)' : 'var(--error)',
                    flexShrink: 0 
                  }}>
                    {user.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '4px', marginLeft: '8px', flexShrink: 0 }}>
                  {!user.is_default && (
                    <>
                      <button
                        onClick={() => openEditUserModal(user)}
                        className="btn btn-secondary"
                        style={{ padding: '6px', color: 'var(--text-secondary)' }}
                        title="Edit user"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => setResetTarget(user)}
                        className="btn btn-secondary"
                        style={{ padding: '6px', color: 'var(--text-secondary)' }}
                        title="Reset password"
                      >
                        <Key size={16} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(user)}
                        className="btn btn-secondary"
                        style={{ padding: '6px', color: '#ef4444' }}
                        title="Delete user"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              
              {user.role === 'user' && !user.is_default && (
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  <Folder size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                  {(user.folders || []).length > 0 ? `${(user.folders || []).length} folder(s)` : 'No folders assigned'}
                </div>
              )}
            </div>
            ))}
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e: React.MouseEvent) => e.stopPropagation()} style={{ maxWidth: '480px', width: '90%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <h3 className="modal-title">New User</h3>
              <button onClick={() => setShowCreateModal(false)} className="btn btn-secondary" style={{ padding: '6px' }}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="form-label">Username</label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="johndoe"
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '14px' }}
                />
              </div>
              <div>
                <label className="form-label">Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '14px' }}
                />
              </div>
              <div>
                <label className="form-label">Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'admin' | 'user')}
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '14px' }}
                >
                  <option value="user">User (read-only + edit assigned folders)</option>
                  <option value="admin">Admin (full access + user management)</option>
                </select>
              </div>
              {newRole === 'user' && (
                <div>
                  <label className="form-label">Folders (edit access)</label>
                  <div style={{ marginTop: '8px' }}>
                    <FolderMultiSelect
                      folders={folders}
                      selected={newFolders}
                      onChange={(f) => setNewFolders(f)}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ flexShrink: 0, borderTop: '1px solid var(--border-color)' }}>
              <button onClick={() => setShowCreateModal(false)} className="btn btn-secondary">Cancel</button>
              <button onClick={handleCreate} className="btn btn-primary" disabled={creating}>
                {creating ? <><Loader size={16} className="spinner" /> Creating...</> : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="modal-overlay" onClick={() => setResetTarget(null)}>
          <div className="modal" onClick={(e: React.MouseEvent) => e.stopPropagation()} style={{ maxWidth: '420px', width: '90%' }}>
            <div className="modal-header">
              <h3 className="modal-title">Reset Password — {resetTarget.username}</h3>
              <button onClick={() => setResetTarget(null)} className="btn btn-secondary" style={{ padding: '6px' }}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div>
                <label className="form-label">New Password</label>
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="••••••••"
                  autoFocus
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '14px' }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setResetTarget(null)} className="btn btn-secondary">Cancel</button>
              <button onClick={handleResetPassword} className="btn btn-primary" disabled={resetting || !resetPassword}>
                {resetting ? <><Loader size={16} className="spinner" /> Resetting...</> : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editUserTarget && (
        <div className="modal-overlay" onClick={() => setEditUserTarget(null)}>
          <div className="modal" onClick={(e: React.MouseEvent) => e.stopPropagation()} style={{ maxWidth: '480px', width: '90%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header" style={{ flexShrink: 0 }}>
              <h3 className="modal-title">Edit User — {editUserTarget.username}</h3>
              <button onClick={() => setEditUserTarget(null)} className="btn btn-secondary" style={{ padding: '6px' }}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="form-label">Username</label>
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '14px' }}
                />
              </div>
              <div>
                <label className="form-label">Role</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as 'admin' | 'user')}
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '14px' }}
                >
                  <option value="user">User (read-only + edit assigned folders)</option>
                  <option value="admin">Admin (full access + user management)</option>
                </select>
              </div>
              <div>
                <label className="form-label">Status</label>
                <select
                  value={editActive ? 'active' : 'inactive'}
                  onChange={(e) => setEditActive(e.target.value === 'active')}
                  style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '14px' }}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              {editRole === 'user' && (
                <div>
                  <label className="form-label">Folders (edit access)</label>
                  <div style={{ marginTop: '8px' }}>
                    <FolderMultiSelect
                      folders={folders}
                      selected={editFolders}
                      onChange={(f) => setEditFolders(f)}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ flexShrink: 0, borderTop: '1px solid var(--border-color)' }}>
              <button onClick={() => setEditUserTarget(null)} className="btn btn-secondary">Cancel</button>
              <button onClick={saveUser} className="btn btn-primary" disabled={savingUser || !editUsername.trim()}>
                {savingUser ? <><Loader size={16} className="spinner" /> Saving...</> : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Delete User"
        message={deleteTarget ? `Are you sure you want to delete user "${deleteTarget.username}"? This action cannot be undone.` : ''}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
