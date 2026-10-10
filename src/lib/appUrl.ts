/** The app's root URL without the hash, e.g. `https://erfandejband.github.io/chinese_flash_card/`. Sign-in flows return here. */
export function appRootUrl(): string {
  return `${location.origin}${import.meta.env.BASE_URL}`
}
