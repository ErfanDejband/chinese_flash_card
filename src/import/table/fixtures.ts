/** Word lists as other apps export them, for the tests of `import/table`. */

/** Anki "Notes in Plain Text" with HTML, media, tags and the identifier/notetype/deck columns. */
export const ANKI_EXPORT = [
  '#separator:tab',
  '#html:true',
  '#guid column:1',
  '#notetype column:2',
  '#deck column:3',
  '#tags column:7',
  'a1B2c3\tChinese (basic)\tMandarin::HSK1\t老師\tlǎoshī\tteacher<br>instructor [sound:laoshi.mp3]\tHSK1 people',
  'd4E5f6\tChinese (basic)\tMandarin::HSK1\t<b>學生</b>\txué&nbsp;shēng\t"student, <span style=""color: red"">pupil</span>"\tHSK1',
  'g7H8i9\tChinese (basic)\tMandarin::HSK1\t謝謝\txièxie\tthanks&amp;more\t',
  '',
].join('\n')

/** Anki's Basic note type with names, the pinyin on the back above the meaning. */
export const ANKI_BASIC = ['#separator:Comma', '#html:true', '#columns:Front,Back', '老師,lǎoshī<br>teacher', '學生,<div>xuésheng</div><div>student</div>'].join('\r\n')

/** An older Anki export: no header lines, but sound tags and HTML. */
export const ANKI_LEGACY = '老師\tlǎoshī\tteacher [sound:a.mp3]\n學生\txuésheng\tstudent<br>pupil\n'

/** Pleco "Export Cards": categories, Simplified[Traditional], numbered pinyin, private-use formatting. */
export const PLECO_EXPORT = [
  '// HSK 1',
  '你们[你們]\tni3men5\tyou (plural)',
  '老师[老師]\tlao3shi1\tnoun teacher',
  '我\two3\tpronoun I; me',
  '// Food/Rice',
  '米饭[米飯]\tmi3fan4\t\uEAB1cooked\uEAB2 "rice',
  '',
].join('\n')

/** Quizlet export, tab between term and definition; terms with their pinyin. */
export const QUIZLET_TAB = '老師 lǎoshī\tteacher\n學生 (xuésheng)\tstudent\n謝謝\tthank you\n'

/** Quizlet export with commas: definitions may hold commas too. */
export const QUIZLET_COMMA = '老師,teacher, instructor\n學生,student\n'

/** Excel in Europe: semicolons, a BOM, quoted fields with semicolons and line breaks, a blank row. */
export const EXCEL_SEMICOLON = '\uFEFF漢字;拼音;英文;例句;備註\r\n老師;lǎoshī;"teacher; instructor";我是老師。;"line one\r\nline two"\r\n;;;;\r\n"學生";xuésheng;student;;\r\n'

/** A spreadsheet with English column names, including the example's pinyin and meaning. */
export const NAMED_CSV = [
  'Chinese,Pinyin,English,Example,Example pinyin,Example meaning,Tags',
  '老師,lǎoshī,teacher,我是老師。,Wǒ shì lǎoshī.,I am a teacher.,people school',
  '書,shū,book,,,,',
].join('\n')
