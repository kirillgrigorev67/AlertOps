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

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
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
          <NavLink to="/alerts" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Bell size={20} />
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