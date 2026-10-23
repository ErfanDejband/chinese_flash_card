import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { router } from './app/router'
import { UpdatePrompt } from './app/UpdatePrompt'
import { countReviews } from './data/repositories/review'
import { TIP_IDS } from './features/onboarding/tips'
import './lib/install' // registers the install-prompt listener early
import { handleGoogleCallback } from './lib/googleSignIn'
import { initOnboarding } from './lib/onboarding'
import { handleOpenRouterCallback } from './lib/openrouterSignIn'
import { initSync } from './lib/syncRunner'
import { requestPersistentStorage } from './lib/storage'
import { initTheme } from './lib/theme'
import './index.css'

initTheme()
void requestPersistentStorage()
void initOnboarding(TIP_IDS, async () => (await countReviews()) > 0)

// Back from a sign-in (OpenRouter: `?code=`, Google: `#access_token=`): finish it and show the
// screen it was started from.
const googleCallback = handleGoogleCallback()
const returnTo = handleOpenRouterCallback() ?? googleCallback?.returnTo
if (returnTo) void router.navigate(returnTo, { replace: true })
initSync(googleCallback)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
    <UpdatePrompt />
  </StrictMode>,
)
