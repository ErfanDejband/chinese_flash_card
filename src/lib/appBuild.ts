export interface AppBuild {
  /** UTC day of the build, `YYYY-MM-DD`. */
  date: string
  /** Short commit hash, or `'dev'`. */
  sha: string
}

/** The build running on this device (set by vite.config.ts). */
export function appBuild(): AppBuild {
  return typeof __APP_BUILD__ === 'undefined' ? { date: 'dev', sha: 'dev' } : __APP_BUILD__
}

/** "2026-10-28 · abc1234". */
export function versionLabel(build: AppBuild = appBuild()): string {
  return `${build.date} · ${build.sha}`
}
