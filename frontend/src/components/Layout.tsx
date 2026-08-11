import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Bell, 
  History, 
  Settings, 
  Zap,
  ShieldAlert
} from 'lucide-react'
import ServiceStatus from './ServiceStatus'
import api from '../api/client'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const [unreadCount, setUnreadCount] = useState(0)

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
        <div style={{ padding: '0 20px 20px', borderBottom: '1px solid var(--border-color)' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={24} color="var(--accent-primary)" />
            AlertOps
          </h1>
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
          <NavLink to="/providers" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Settings size={20} />
            LLM Providers
          </NavLink>
        </nav>
      </aside>
      
      <main className="main-content">
        <ServiceStatus />
        {children}
      </main>
    </div>
  )
}
