import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import DevicePage from './pages/DevicePage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/device" element={<DevicePage />} />
    </Routes>
  )
}
