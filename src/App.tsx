import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppProvider } from './lib/app'
import { UiProvider } from './components/ui'
import { Layout } from './components/Layout'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import Documents from './pages/Documents'
import AiChat from './pages/AiChat'
import Analysis from './pages/Analysis'
import Settings from './pages/Settings'
import { Activities, Agenda, Expenses, Food, Health, Places, Wellbeing } from './pages/Modules'
import { useReminders } from './lib/reminders'

function Shell() {
  useReminders()
  return <Layout />
}

export default function App() {
  return (
    <UiProvider>
      <AppProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<Dashboard />} />
              <Route path="salute" element={<Health />} />
              <Route path="alimentazione" element={<Food />} />
              <Route path="attivita" element={<Activities />} />
              <Route path="benessere" element={<Wellbeing />} />
              <Route path="spese" element={<Expenses />} />
              <Route path="agenda" element={<Agenda />} />
              <Route path="archivio" element={<Documents />} />
              <Route path="luoghi" element={<Places />} />
              <Route path="analisi" element={<Analysis />} />
              <Route path="ai" element={<AiChat />} />
              <Route path="profilo" element={<Profile />} />
              <Route path="impostazioni" element={<Settings />} />
              <Route path="*" element={<Dashboard />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </UiProvider>
  )
}
