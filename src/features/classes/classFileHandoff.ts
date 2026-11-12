/** Hands a class file chosen elsewhere (Backup's "Restore from file") to the Join screen in memory. */
let pending: File | undefined

export function setClassFile(file: File): void {
  pending = file
}

export function takeClassFile(): File | undefined {
  const file = pending
  pending = undefined
  return file
}
