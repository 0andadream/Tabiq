import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from 'react-router-dom'
import { Shell } from './components/Shell.tsx'
import { WalletProvider } from './context/WalletContext.tsx'
import { Activity } from './screens/Activity.tsx'
import { AddExpense } from './screens/AddExpense.tsx'
import { CreateGroup } from './screens/CreateGroup.tsx'
import { GroupScreen } from './screens/Group.tsx'
import { Home } from './screens/Home.tsx'
import { Invite } from './screens/Invite.tsx'
import { Join } from './screens/Join.tsx'
import { Settings } from './screens/Settings.tsx'
import { Settle } from './screens/Settle.tsx'
import { Splash } from './screens/Splash.tsx'

function Root() {
  const [params] = useSearchParams()
  const code = params.get('join') || params.get('g')
  if (code) return <Navigate to={`/join/${code}`} replace />
  return <Splash />
}

const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || undefined

export default function App() {
  return (
    <WalletProvider>
      <BrowserRouter basename={basename}>
        <Routes>
          <Route path="/" element={<Root />} />
          <Route element={<Shell />}>
            <Route path="/app" element={<Home />} />
            <Route path="/join" element={<Join />} />
            <Route path="/join/:code" element={<Join />} />
            <Route path="/create" element={<CreateGroup />} />
            <Route path="/activity" element={<Activity global />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/g/:id" element={<GroupScreen />} />
            <Route path="/g/:id/add" element={<AddExpense />} />
            <Route path="/g/:id/pay" element={<Settle />} />
            <Route path="/g/:id/activity" element={<Activity />} />
            <Route path="/g/:id/invite" element={<Invite />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </WalletProvider>
  )
}
