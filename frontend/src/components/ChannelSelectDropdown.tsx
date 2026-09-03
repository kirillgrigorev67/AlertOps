import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search, X, Check } from 'lucide-react'

interface Channel {
  id: string
  name: string
  channel_type: string
}

interface ChannelSelectDropdownProps {
  channels: Channel[]
  selectedIds: string[]
  onChange: (selectedIds: string[]) => void
  label?: string
  placeholder?: string
}

export default function ChannelSelectDropdown({
  channels,
  selectedIds,
  onChange,
  label = 'Notify via',
  placeholder = 'Search channels...',
}: ChannelSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredChannels = channels.filter(ch =>
    ch.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ch.channel_type.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const selectedChannels = channels.filter(ch => selectedIds.includes(ch.id))

  const toggleChannel = (channelId: string) => {
    if (selectedIds.includes(channelId)) {
      onChange(selectedIds.filter(id => id !== channelId))
    } else {
      onChange([...selectedIds, channelId])
    }
  }

  const removeChannel = (channelId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(selectedIds.filter(id => id !== channelId))
  }

  const getChannelIcon = (channelType: string) => {
    return channelType === 'telegram' ? 'TG' : 'WH'
  }

  const getChannelColor = (channelType: string) => {
    return channelType === 'telegram'
      ? { bg: 'rgba(34, 158, 217, 0.15)', text: '#229ed9' }
      : { bg: 'rgba(99, 102, 241, 0.15)', text: '#6366f1' }
  }

  return (
    <div style={{ marginBottom: '12px' }} ref={dropdownRef}>
      <label style={{
        display: 'block',
        marginBottom: '6px',
        fontSize: '13px',
        fontWeight: 500,
        color: 'var(--text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.3px',
      }}>
        {label}
      </label>

      {/* Selected tags + dropdown trigger */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          cursor: 'pointer',
          minHeight: '40px',
          flexWrap: 'wrap',
          gap: '6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', flex: 1 }}>
          {selectedChannels.length === 0 ? (
            <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Select channels...</span>
          ) : (
            selectedChannels.map(ch => {
              const colors = getChannelColor(ch.channel_type)
              return (
                <span
                  key={ch.id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-sm)',
                    background: colors.bg,
                    color: colors.text,
                    fontSize: '12px',
                    fontWeight: 500,
                  }}
                >
                  <span style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    padding: '1px 3px',
                    borderRadius: '3px',
                    background: 'rgba(255,255,255,0.2)',
                  }}>
                    {getChannelIcon(ch.channel_type)}
                  </span>
                  {ch.name}
                  <X
                    size={12}
                    style={{ cursor: 'pointer', opacity: 0.7 }}
                    onClick={(e) => removeChannel(ch.id, e)}
                  />
                </span>
              )
            })
          )}
        </div>
        <ChevronDown
          size={16}
          color="var(--text-muted)"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
            flexShrink: 0,
          }}
        />
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div
          style={{
            position: 'relative',
            marginTop: '4px',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            zIndex: 9999,
            maxHeight: '280px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Search */}
          <div style={{ padding: '8px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ position: 'relative' }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
              <input
                type="text"
                placeholder={placeholder}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onClick={e => e.stopPropagation()}
                style={{
                  width: '100%',
                  padding: '6px 10px 6px 32px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  outline: 'none',
                }}
                autoFocus
              />
            </div>
          </div>

          {/* Channel list */}
          <div style={{ overflow: 'auto', maxHeight: '220px' }}>
            {filteredChannels.length === 0 ? (
              <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                No channels found
              </div>
            ) : (
              filteredChannels.map(ch => {
                const isSelected = selectedIds.includes(ch.id)
                const colors = getChannelColor(ch.channel_type)
                return (
                  <div
                    key={ch.id}
                    onClick={() => toggleChannel(ch.id)}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      background: isSelected ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <div
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '4px',
                        border: isSelected ? '2px solid var(--accent-primary)' : '2px solid var(--border)',
                        background: isSelected ? 'var(--accent-primary)' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {isSelected && <Check size={12} color="#fff" />}
                    </div>

                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 5px',
                        borderRadius: '4px',
                        background: colors.bg,
                        color: colors.text,
                        flexShrink: 0,
                      }}
                    >
                      {getChannelIcon(ch.channel_type)}
                    </span>

                    <span style={{ fontSize: '13px', flex: 1 }}>{ch.name}</span>

                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                      {ch.channel_type}
                    </span>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          {selectedChannels.length > 0 && (
            <div
              style={{
                padding: '8px 12px',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {selectedChannels.length} selected
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onChange([])
                }}
                style={{
                  fontSize: '12px',
                  color: 'var(--error)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}