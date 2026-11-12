/** Hands a chosen word-list file (and any picture files chosen with it) to the `/import/list` screen in memory (files can't go through the URL). */

let pending: File[] = []

export function setWordListFile(files: File | File[]): void {
  pending = Array.isArray(files) ? files : [files]
}

/** The files waiting for the screen. They stay until {@link clearWordListFile}, so a re-render reads them again. */
export function pendingWordListFiles(): File[] {
  return pending
}

export function clearWordListFile(): void {
  pending = []
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** File-input `accept` for word lists. */
export const WORD_LIST_ACCEPT = `.csv,.tsv,.txt,.xlsx,text/csv,text/tab-separated-values,text/plain,${XLSX_TYPE}`

/** Excel workbooks and the text files exported by Anki, Pleco, Quizlet or a spreadsheet (Windows often reports .csv as an Excel type). */
export function isWordListFile(file: File): boolean {
  return /\.(csv|tsv|txt|xlsx)$/i.test(file.name) || ['text/csv', 'text/tab-separated-values', 'text/plain', XLSX_TYPE].includes(file.type)
}
