import { Outlet } from 'react-router-dom'

export function Shell() {
  return (
    <div className="app-root">
      <div className="app-frame">
        <Outlet />
      </div>
    </div>
  )
}
