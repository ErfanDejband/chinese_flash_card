/**
 * Ask the browser not to evict our IndexedDB under storage pressure. Chrome decides silently
 * (installed PWAs are normally granted); no prompt is shown.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}

export interface StorageInfo {
  persisted: boolean
  usage?: number
  quota?: number
}

export async function storageInfo(): Promise<StorageInfo> {
  if (!navigator.storage) return { persisted: false }
  const [persisted, estimate] = await Promise.all([
    navigator.storage.persisted?.() ?? Promise.resolve(false),
    navigator.storage.estimate?.() ?? Promise.resolve(undefined),
  ])
  return { persisted, usage: estimate?.usage, quota: estimate?.quota }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

export function downloadFile(data: Blob, fileName: string): void {
  const url = URL.createObjectURL(data)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
