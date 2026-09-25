import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { router } from './app/router'
import { UpdatePrompt } from './app/UpdatePrompt'
import './lib/install' // registers the install-prompt listener early
import { requestPersistentStorage } from './lib/storage'
import './index.css'

void requestPersistentStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
    <UpdatePrompt />
  </StrictMode>,
)
