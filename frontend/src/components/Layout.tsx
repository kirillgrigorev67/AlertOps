import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Bell, 
  History, 
  Settings, 
  Zap,
  ShieldAlert,
  Sun,
  Moon,
  Radio,
  LogOut,
  User as UserIcon
} from 'lucide-react'
import ServiceStatus from './ServiceStatus'
import { useTheme } from './ThemeContext'
import { useAuth } from './AuthContext'
import api from '../api/client'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const [unreadCount, setUnreadCount] = useState(0)
  const { theme, toggleTheme } = useTheme()
  const { user, logout, isAdmin, authEnabled } = useAuth()

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const data = await api.get<{ unread_count: number }>('/alerts/unread-count')
        setUnreadCount(data.unread_count)
      } catch {
        // Silently ignore errors
      }
    }

    fetchUnread()
    const interval = setInterval(fetchUnread, 5000)
    return () => clearInterval(interval)
  }, [])

  const formatBadge = (count: number): string => {
    if (count <= 0) return ''
    if (count > 99) return '99+'
    return String(count)
  }

  const badgeText = formatBadge(unreadCount)

  return (
    <div className="layout">
      <aside className="sidebar">
        <div style={{ padding: '0 20px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={24} color="var(--accent-primary)" />
            AlertOps
          </h1>
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            style={{
              padding: '6px',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              transition: 'var(--transition)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'
              ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-tertiary)'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'
              ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'
            }}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
        
        <nav style={{ marginTop: '16px' }}>
          <NavLink to="/dashboards" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <LayoutDashboard size={20} />
            Dashboards
          </NavLink>
          <NavLink 
            to="/alerts" 
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Bell size={20} />
              {badgeText && (
                <span style={{
                  position: 'absolute',
                  top: '-8px',
                  right: '-12px',
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 700,
                  minWidth: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 5px',
                  lineHeight: 1,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                  border: '2px solid var(--bg-secondary)',
                }}>
                  {badgeText}
                </span>
              )}
            </div>
            Active Alerts
          </NavLink>
          <NavLink to="/rules" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <ShieldAlert size={20} />
            Alert Rules
          </NavLink>
          <NavLink to="/history" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <History size={20} />
            History
          </NavLink>
          {isAdmin && (
            <>
              <NavLink to="/channels" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Radio size={20} />
                Channels
              </NavLink>
              <NavLink to="/providers" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <Settings size={20} />
                LLM Providers
              </NavLink>
              {authEnabled && (
                <NavLink to="/users" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <UserIcon size={20} />
                  Users
                </NavLink>
              )}
            </>
          )}
        </nav>

        {authEnabled && user && (
          <div style={{
            marginTop: 'auto',
            padding: '12px 20px',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserIcon size={16} color="var(--text-secondary)" />
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {user.username}
                <span style={{ marginLeft: '6px', fontSize: '11px', opacity: 0.7 }}>({user.role})</span>
              </span>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              style={{
                padding: '4px',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </aside>
      
      <main className="main-content">
        <ServiceStatus />
        {children}
      </main>
    </div>
  )
}
