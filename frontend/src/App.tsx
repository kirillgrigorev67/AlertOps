import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboards from './pages/Dashboards'
import ActiveAlerts from './pages/ActiveAlerts'
import AlertRules from './pages/AlertRules'
import AlertHistory from './pages/AlertHistory'
import CreateAlert from './pages/CreateAlert'
import Providers from './pages/Providers'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboards />} />
        <Route path="/dashboards" element={<Dashboards />} />
        <Route path="/create-alert" element={<CreateAlert />} />
        <Route path="/alerts" element={<ActiveAlerts />} />
        <Route path="/rules" element={<AlertRules />} />
        <Route path="/history" element={<AlertHistory />} />
        <Route path="/providers" element={<Providers />} />
      </Routes>
    </Layout>
  )
}

export default App
