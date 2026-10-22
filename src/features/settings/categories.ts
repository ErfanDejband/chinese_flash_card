import type { IconName } from '@/ui/icons'

/** The sections of the Settings screen, each rendered by its own component (see SettingsPage). */
export type SettingsSectionId =
  | 'direction'
  | 'leitner'
  | 'knownWords'
  | 'appearance'
  | 'voice'
  | 'ai'
  | 'pictures'
  | 'usage'
  | 'sync'
  | 'backup'
  | 'support'
  | 'help'
  | 'app'

export const SECTION_TITLES: Record<SettingsSectionId, string> = {
  direction: 'Practice direction',
  leitner: 'Leitner boxes',
  knownWords: 'Known words',
  appearance: 'Appearance',
  voice: 'Pronunciation',
  ai: 'AI for PDF import',
  pictures: 'Pictures for cards',
  usage: 'AI usage on this device',
  sync: 'Sync between devices',
  backup: 'Backup',
  support: 'Support this app',
  help: 'Help & tips',
  app: 'App',
}

export interface SettingsCategory {
  /** URL segment: `/settings/<id>`. */
  id: 'study' | 'display' | 'ai' | 'sync' | 'about'
  title: string
  icon: IconName
  /** One line under the title in the phone's category list. */
  description: string
  sections: SettingsSectionId[]
}

/** Settings grouped into pages: a list of these on a phone, a sidebar on a laptop. */
export const SETTINGS_CATEGORIES: readonly SettingsCategory[] = [
  {
    id: 'study',
    title: 'Study',
    icon: 'cards',
    description: 'Practice direction, Leitner boxes, known words',
    sections: ['direction', 'leitner', 'knownWords'],
  },
  { id: 'display', title: 'Display & sound', icon: 'contrast', description: 'Light or dark, pronunciation voice', sections: ['appearance', 'voice'] },
  { id: 'ai', title: 'AI & pictures', icon: 'sparkle', description: 'AI for importing, pictures for cards, usage', sections: ['ai', 'pictures', 'usage'] },
  { id: 'sync', title: 'Sync & backup', icon: 'cloud', description: 'Google Drive sync, backup files', sections: ['sync', 'backup'] },
  {
    id: 'about',
    title: 'About & support',
    icon: 'heart',
    description: 'Help, support this app, install, storage, privacy',
    sections: ['help', 'support', 'app'],
  },
]

export function findCategory(id: string | undefined): SettingsCategory | undefined {
  return SETTINGS_CATEGORIES.find((c) => c.id === id)
}
