import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { inject } from '@vercel/analytics'
import './index.css'
import App from './App.tsx'
import { isAnalyticsEnabled } from './lib/analytics'

inject({ beforeSend: event => isAnalyticsEnabled() ? event : null })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
