import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './components/AuthContext'
import Layout from './components/Layout'
import Dashboards from './pages/Dashboards'
import ActiveAlerts from './pages/ActiveAlerts'
import AlertRules from './pages/AlertRules'
import AlertHistory from './pages/AlertHistory'
import CreateAlert from './pages/CreateAlert'
import Providers from './pages/Providers'
import NotificationChannels from './pages/NotificationChannels'
import Users from './pages/Users'
import Login from './pages/Login'

function App() {
  const { isAuthenticated, isAdmin } = useAuth()

  if (!isAuthenticated) {
    return <Login />
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboards />} />
        <Route path="/dashboards" element={<Dashboards />} />
        <Route path="/create-alert" element={<CreateAlert />} />
        <Route path="/alerts" element={<ActiveAlerts />} />
        <Route path="/rules" element={<AlertRules />} />
        <Route path="/history" element={<AlertHistory />} />
        <Route path="/providers" element={isAdmin ? <Providers /> : <Navigate to="/" replace />} />
        <Route path="/channels" element={isAdmin ? <NotificationChannels /> : <Navigate to="/" replace />} />
        <Route path="/users" element={isAdmin ? <Users /> : <Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

export default App
