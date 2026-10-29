import { createHashRouter, Navigate } from 'react-router'
import { BoxDetailPage } from '@/features/boxes/BoxDetailPage'
import { CardsPage } from '@/features/cards/CardsPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { ReviewPage } from '@/features/review/ReviewPage'
import { SettingsCategoryPage, SettingsIndex, SettingsLayout } from '@/features/settings/SettingsPage'
import { StatsPage } from '@/features/stats/StatsPage'
import { AppLayout } from './AppLayout'
import { NotFound, RouteError } from './RouteError'

// Lazy routes keep heavy dependencies out of the bundle that the review screen needs:
// the card form carries the pinyin dictionary (pinyin-pro), the import page will carry pdf.js.
const cardEditPage = async () => ({ Component: (await import('@/features/cards/CardEditPage')).CardEditPage })
const importPage = async () => ({ Component: (await import('@/features/import/ImportPage')).ImportPage })
const importSessionPage = async () => ({ Component: (await import('@/features/import/ImportSessionPage')).ImportSessionPage })
const wordListImport = async () => ({ Component: (await import('@/features/import/WordListImport')).WordListImport })
const picturesPage = async () => ({ Component: (await import('@/features/pictures/PicturesPage')).PicturesPage })
const helpPage = async () => ({ Component: (await import('@/features/help/HelpPage')).HelpPage })
// Snap and its test page; Transformers.js loads only when the object detector is loaded.
const snapPage = async () => ({ Component: (await import('@/features/snap/SnapPage')).SnapPage })
const objectsLab = async () => ({ Component: (await import('@/features/lab/ObjectsLab')).ObjectsLab })

/**
 * Hash routing: works on static hosting (GitHub Pages) without server rewrites,
 * and deep links keep working inside the installed PWA.
 */
export const router = createHashRouter([
  // Full-screen, outside the nav layout.
  { path: '/review', element: <ReviewPage />, errorElement: <RouteError /> },
  {
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'cards', element: <CardsPage /> },
      { path: 'cards/new', lazy: cardEditPage },
      { path: 'cards/:id', lazy: cardEditPage },
      { path: 'boxes/:box', element: <BoxDetailPage /> },
      { path: 'import', lazy: importPage },
      { path: 'import/list', lazy: wordListImport },
      { path: 'import/:importId', lazy: importSessionPage },
      { path: 'pictures/:jobId', lazy: picturesPage },
      {
        path: 'settings',
        element: <SettingsLayout />,
        children: [
          { index: true, element: <SettingsIndex /> },
          { path: ':category', element: <SettingsCategoryPage /> },
        ],
      },
      { path: 'progress', element: <StatsPage /> },
      { path: 'help', lazy: helpPage },
      { path: 'snap', lazy: snapPage },
      { path: 'lab/objects', lazy: objectsLab },
      { path: 'stats', element: <Navigate to="/progress" replace /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])
