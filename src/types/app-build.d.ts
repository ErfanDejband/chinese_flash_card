/** Set at build time by `define` in vite.config.ts; read it through `appBuild()` (lib/appBuild). */
declare const __APP_BUILD__: {
  /** UTC day of the build, `YYYY-MM-DD`. */
  readonly date: string
  /** Short commit hash, or `'dev'` outside a git checkout. */
  readonly sha: string
}
