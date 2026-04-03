import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LocaleProvider } from './components/LocaleProvider'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </StrictMode>,
)
