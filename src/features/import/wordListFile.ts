/** Hands a chosen word-list file to the `/import/list` screen in memory (files can't go through the URL). */

let pending: File | undefined

export function setWordListFile(file: File): void {
  pending = file
}

/** The file waiting for the screen. It stays until {@link clearWordListFile}, so a re-render reads it again. */
export function pendingWordListFile(): File | undefined {
  return pending
}

export function clearWordListFile(): void {
  pending = undefined
}

/** File-input `accept` for word lists. */
export const WORD_LIST_ACCEPT = '.csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain'

/** Text files exported by Anki, Pleco, Quizlet or a spreadsheet (Windows often reports .csv as an Excel type). */
export function isWordListFile(file: File): boolean {
  return /\.(csv|tsv|txt)$/i.test(file.name) || ['text/csv', 'text/tab-separated-values', 'text/plain'].includes(file.type)
}
