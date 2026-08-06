import { useState, useEffect } from 'react'
import { Activity } from 'lucide-react'
import api from '../api/client'

interface ServiceHealth {
  service: string
  status: string
  url: string
  error?: string
}

export default function ServiceStatus() {
  const [services, setServices] = useState<ServiceHealth[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const data = await api.get<ServiceHealth[]>('/health/services')
        setServices(data)
      } catch (err) {
        console.error('Failed to check service health:', err)
      } finally {
        setLoading(false)
      }
    }

    checkHealth()
    const interval = setInterval(checkHealth, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) return null

  return (
    <div style={{ 
      display: 'flex', 
      gap: '16px', 
      marginBottom: '16px',
      padding: '8px 12px',
      backgroundColor: 'var(--bg-secondary)',
      borderRadius: 'var(--radius-sm)',
      border: '1px solid var(--border-color)',
      fontSize: '12px'
    }}>
      <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <Activity size={14} />
        Services:
      </span>
      {services.map(s => (
        <span key={s.service} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span className={`status-dot status-${s.status}`} />
          <span style={{ color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
            {s.service}
          </span>
        </span>
      ))}
    </div>
  )
}