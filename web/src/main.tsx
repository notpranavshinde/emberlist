import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { inject } from '@vercel/analytics'
import './index.css'
import { isAnalyticsEnabled } from './lib/analytics'

const isStatsRoute = window.location.hash === '#/stats' || window.location.hash.startsWith('#/stats?')
const root = createRoot(document.getElementById('root')!)

if (isStatsRoute) {
  void import('./StatsDashboard.tsx').then(({ default: StatsDashboard }) => {
    root.render(<StrictMode><StatsDashboard /></StrictMode>)
  })
} else {
  inject({ beforeSend: event => isAnalyticsEnabled() ? event : null })
  void import('./App.tsx').then(({ default: App }) => {
    root.render(<StrictMode><App /></StrictMode>)
  })
}
