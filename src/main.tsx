import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { router } from './app/router'
import { UpdatePrompt } from './app/UpdatePrompt'
import './lib/install' // registers the install-prompt listener early
import { handleOpenRouterCallback } from './lib/openrouterSignIn'
import { requestPersistentStorage } from './lib/storage'
import './index.css'

void requestPersistentStorage()

// Back from "Sign in with OpenRouter": finish it and show the screen it was started from.
const returnTo = handleOpenRouterCallback()
if (returnTo) void router.navigate(returnTo, { replace: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
    <UpdatePrompt />
  </StrictMode>,
)
