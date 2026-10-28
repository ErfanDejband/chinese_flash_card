/** Bytes of a word-list file → text. Other apps and Excel write UTF-8, UTF-16 ("Unicode text") or, in Taiwan, Big5. */

export type TextEncodingName = 'utf-8' | 'utf-16le' | 'utf-16be' | 'big5' | 'gb18030'

export interface DecodedText {
  text: string
  encoding: TextEncodingName
}

const HAN = /\p{Script=Han}/u

/**
 * Frequent characters in both scripts. A legacy encoding read with the wrong table still gives
 * Han characters (mojibake), but rarely these, so they tell Big5 from GBK.
 */
const COMMON = new Set([
  ...'的一是不了人我你他她們们這这個个那哪來来去上下大小中國国學学生老師师說说話话有在和好很也都吃喝看見见想要會会能',
  ...'字詞词語语文書书朋友家天日月年時时今明早晚水火山車车子女男門门謝谢漢汉電电東东西買买賣卖錢钱飯饭媽妈爸哥姐弟妹',
  ...'貓猫狗魚鱼鳥鸟馬马開开關关問问題题長长對对號号樂乐愛爱認认識识讀读寫写聽听歡欢喜熱热冷醫医點点幾几多少沒没什麼么',
  ...'嗎吗呢吧再請请叫名為为先星期歲岁午飛飞機机坐走回做工作事意思高興兴快慢新舊旧太真錯错第二三四五六七八九十百千萬万',
])

function decode(bytes: Uint8Array, encoding: TextEncodingName): string {
  // The decoder drops a matching BOM itself.
  return new TextDecoder(encoding).decode(bytes)
}

/** UTF-16 without a BOM: ASCII characters (tabs, commas, pinyin) leave zero bytes on one side. */
function utf16WithoutBom(bytes: Uint8Array): TextEncodingName | undefined {
  const sample = bytes.subarray(0, 4000)
  let even = 0
  let odd = 0
  sample.forEach((b, i) => {
    if (b === 0) {
      if (i % 2) odd++
      else even++
    }
  })
  if (even + odd < sample.length * 0.1) return undefined
  return odd >= even ? 'utf-16le' : 'utf-16be'
}

function score(text: string): number {
  let han = 0
  let common = 0
  let bad = 0
  for (const c of text) {
    if (c === '\uFFFD') bad++
    else if (HAN.test(c)) {
      han++
      if (COMMON.has(c)) common++
    }
  }
  return han + 2 * common - 5 * bad
}

/**
 * UTF-8 by default; a UTF-16 BOM (or UTF-16 zero bytes) decodes as UTF-16. When UTF-8 gives
 * replacement characters, Big5 (Taiwan Excel) and GB18030 are tried and the reading with the
 * most (and most frequent) Han characters and the fewest U+FFFD wins. Ties keep the earlier one.
 */
export function decodeText(bytes: Uint8Array): DecodedText {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: decode(bytes, 'utf-16le'), encoding: 'utf-16le' }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: decode(bytes, 'utf-16be'), encoding: 'utf-16be' }
  const utf16 = bytes[0] === 0xef ? undefined : utf16WithoutBom(bytes)
  if (utf16) return { text: decode(bytes, utf16), encoding: utf16 }

  const utf8 = decode(bytes, 'utf-8')
  if (!utf8.includes('\uFFFD')) return { text: utf8, encoding: 'utf-8' }

  let best: DecodedText = { text: utf8, encoding: 'utf-8' }
  let bestScore = score(utf8)
  for (const encoding of ['big5', 'gb18030'] as const) {
    const text = decode(bytes, encoding)
    const s = score(text)
    if (s > bestScore) {
      best = { text, encoding }
      bestScore = s
    }
  }
  return best
}

export const ENCODING_LABEL: Record<TextEncodingName, string> = {
  'utf-8': 'UTF-8',
  'utf-16le': 'UTF-16',
  'utf-16be': 'UTF-16',
  big5: 'Big5',
  gb18030: 'GBK',
}
