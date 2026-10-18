import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import api from '../api/client'

interface AuthUser {
  username: string
  role: 'admin' | 'user'
  folders?: string[]  // folders the user can edit (for user role)
}

interface AuthContextType {
  user: AuthUser | null
  authEnabled: boolean
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  isAdmin: boolean
  canEditFolder: (folderName: string | null) => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authEnabled, setAuthEnabled] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      try {
        // Check if auth is enabled
        const status = await api.auth.status()
        setAuthEnabled(status.enabled)
        
        if (!status.enabled) {
          // Auth disabled — auto-login as admin
          setUser({ username: 'anonymous', role: 'admin', folders: [] })
          return
        }
        
        // Check if we have a stored token
        const token = localStorage.getItem('alertops_token')
        if (token) {
          try {
            const me = await api.auth.me()
            // Folders are now returned directly from /auth/me
            setUser({ 
              username: me.username, 
              role: me.role as 'admin' | 'user', 
              folders: me.folders || [] 
            })
          } catch {
            // Token invalid — clear it
            localStorage.removeItem('alertops_token')
            localStorage.removeItem('alertops_user')
          }
        }
      } catch {
        // If we can't reach the API, assume auth is enabled but not logged in
      } finally {
        setLoading(false)
      }
    }
    
    init()
  }, [])

  const login = async (username: string, password: string) => {
    const data = await api.auth.login(username, password)
    localStorage.setItem('alertops_token', data.access_token)
    
    // Fetch user info including folders from /auth/me
    try {
      const me = await api.auth.me()
      setUser({ 
        username: me.username, 
        role: me.role as 'admin' | 'user', 
        folders: me.folders || [] 
      })
    } catch {
      // If we can't fetch user info, use basic info from login response
      setUser({ username, role: data.role as 'admin' | 'user', folders: [] })
    }
  }

  const logout = () => {
    localStorage.removeItem('alertops_token')
    localStorage.removeItem('alertops_user')
    setUser(null)
  }

  const canEditFolder = (folderName: string | null): boolean => {
    if (!user) return false
    if (user.role === 'admin') return true
    // User role - check if folder is in their list
    if (!folderName) return false  // No folder = no access for user role
    return user.folders?.includes(folderName) || false
  }

  return (
    <AuthContext.Provider value={{
      user,
      authEnabled,
      isAuthenticated: !loading && (authEnabled ? !!user : true),
      login,
      logout,
      isAdmin: user?.role === 'admin',
      canEditFolder,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
