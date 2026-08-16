import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

registerSW({
  immediate: true,
  onNeedRefresh() {
    if (window.confirm('A new version is available. Refresh to update?')) {
      window.location.reload()
    }
  },
  onOfflineReady() {
    console.info('Inventar is ready for offline use.')
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
