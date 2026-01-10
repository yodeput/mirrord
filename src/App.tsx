import { Routes, Route } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import HomePage from './pages/HomePage'

// Lazy load DevicePage to avoid bundling JMuxer with main app
const DevicePage = lazy(() => import('./pages/DevicePage'))

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/device"
        element={
          <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center text-white">Loading...</div>}>
            <DevicePage />
          </Suspense>
        }
      />
    </Routes>
  )
}
