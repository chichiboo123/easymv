export interface LyricFont {
  name: string
  css: string
  kind: 'ko' | 'en'
}

export const LYRIC_FONTS: LyricFont[] = [
  { name: 'Noto Sans KR', css: "'Noto Sans KR', sans-serif", kind: 'ko' },
  { name: 'Nanum Gothic', css: "'Nanum Gothic', sans-serif", kind: 'ko' },
  { name: 'Nanum Myeongjo', css: "'Nanum Myeongjo', serif", kind: 'ko' },
  { name: 'Nanum Pen Script', css: "'Nanum Pen Script', cursive", kind: 'ko' },
  { name: 'Jua', css: "'Jua', sans-serif", kind: 'ko' },
  { name: 'Do Hyeon', css: "'Do Hyeon', sans-serif", kind: 'ko' },
  { name: 'Gaegu', css: "'Gaegu', cursive", kind: 'ko' },
  { name: 'Black Han Sans', css: "'Black Han Sans', sans-serif", kind: 'ko' },
  { name: 'Sunflower', css: "'Sunflower', sans-serif", kind: 'ko' },
  { name: 'Cute Font', css: "'Cute Font', cursive", kind: 'ko' },
  { name: 'Hi Melody', css: "'Hi Melody', cursive", kind: 'ko' },
  { name: 'Poor Story', css: "'Poor Story', cursive", kind: 'ko' },
  { name: 'Gamja Flower', css: "'Gamja Flower', cursive", kind: 'ko' },
  { name: 'Dongle', css: "'Dongle', sans-serif", kind: 'ko' },
  { name: 'Song Myung', css: "'Song Myung', serif", kind: 'ko' },
  { name: 'Poppins', css: "'Poppins', sans-serif", kind: 'en' },
  { name: 'Fredoka', css: "'Fredoka', sans-serif", kind: 'en' },
  { name: 'Caveat', css: "'Caveat', cursive", kind: 'en' },
  { name: 'Pacifico', css: "'Pacifico', cursive", kind: 'en' },
  { name: 'Baloo 2', css: "'Baloo 2', cursive", kind: 'en' },
]

export function fontCss(name: string): string {
  return LYRIC_FONTS.find((f) => f.name === name)?.css ?? "'Jua', sans-serif"
}

const loaded = new Set<string>()

/** Google Fonts 스타일시트를 필요할 때만 주입 */
export function ensureFontLink(name: string): void {
  if (loaded.has(name)) return
  loaded.add(name)
  const family = name.replace(/ /g, '+')
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  // Sunflower는 300/500/700만 제공
  const weights = name === 'Sunflower' ? ':wght@500' : ''
  link.href = `https://fonts.googleapis.com/css2?family=${family}${weights}&display=swap`
  document.head.appendChild(link)
}

/** 캔버스 렌더링 전 폰트가 실제 로드될 때까지 대기 */
export async function loadFontForCanvas(name: string, sampleText: string): Promise<void> {
  ensureFontLink(name)
  const css = fontCss(name)
  try {
    await document.fonts.load(`700 64px ${css}`, sampleText || '가나다ABC')
    await document.fonts.load(`400 64px ${css}`, sampleText || '가나다ABC')
  } catch {
    // 폰트 로드 실패 시 시스템 폰트로 대체 렌더링
  }
}

export function ensureAllFontLinks(): void {
  for (const f of LYRIC_FONTS) ensureFontLink(f.name)
}
