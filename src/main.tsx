import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { TooltipProvider } from '@/components/ui/tooltip'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import { getLocalStorageItem } from './lib/browserStorage'
import { installGlobalErrorHandlers } from './lib/errorLogger'
import './index.css'

// Install global error/rejection listeners for crash reporting
installGlobalErrorHandlers()

const globalFlags = globalThis as typeof globalThis & {
  __lucky7VisibilitySyncInstalled?: boolean
}

// Apply stored theme immediately to avoid flash of wrong theme
{
  const storedTheme = getLocalStorageItem('lucky7_theme')
  if (storedTheme === 'dark' || storedTheme === 'light') {
    document.documentElement.setAttribute('data-theme', storedTheme)
  }
}

// Pause CSS animations while the tab is hidden — saves GPU/battery.
// Framer-motion uses JS RAF which browsers already throttle; this targets CSS animations.
function syncPageVisibility() {
  if (document.hidden) {
    document.documentElement.setAttribute('data-page-hidden', '')
  } else {
    document.documentElement.removeAttribute('data-page-hidden')
  }
}
syncPageVisibility() // set immediately on load
if (!globalFlags.__lucky7VisibilitySyncInstalled) {
  document.addEventListener('visibilitychange', syncPageVisibility)
  globalFlags.__lucky7VisibilitySyncInstalled = true
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <TooltipProvider>
      <ErrorBoundary>
      <App />
      </ErrorBoundary>
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: '#1e293b',
            color: '#e2e8f0',
            border: '1px solid #334155',
          },
        }}
      />
    </TooltipProvider>
    </HashRouter>
  </StrictMode>,
)
