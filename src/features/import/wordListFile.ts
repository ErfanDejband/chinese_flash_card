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

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** File-input `accept` for word lists. */
export const WORD_LIST_ACCEPT = `.csv,.tsv,.txt,.xlsx,text/csv,text/tab-separated-values,text/plain,${XLSX_TYPE}`

/** Excel workbooks and the text files exported by Anki, Pleco, Quizlet or a spreadsheet (Windows often reports .csv as an Excel type). */
export function isWordListFile(file: File): boolean {
  return /\.(csv|tsv|txt|xlsx)$/i.test(file.name) || ['text/csv', 'text/tab-separated-values', 'text/plain', XLSX_TYPE].includes(file.type)
}
