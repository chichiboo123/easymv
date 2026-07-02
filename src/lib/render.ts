import { fontCss } from './fonts'
import type { FontSize, LyricPosition, PageData, Project } from './types'

/** A4 가로 비율(297×210mm) 기준 내부 렌더링 해상도 */
export const PAGE_W = 1920
export const PAGE_H = 1358

const FONT_PX: Record<FontSize, number> = { sm: 60, md: 80, lg: 104 }

export function effectivePosition(project: Project, page: PageData): LyricPosition {
  return page.position ?? project.lyricPosition
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur)
      cur = w
    } else {
      cur = test
    }
  }
  if (cur) lines.push(cur)
  return lines
}

export interface LyricBoxMetrics {
  x: number
  y: number
  w: number
  h: number
  lines: string[]
  fontPx: number
  lineHeight: number
}

/** 가사 박스의 위치·크기 계산 (그리기 화면과 인쇄가 동일 좌표 사용) */
export function measureLyricBox(
  ctx: CanvasRenderingContext2D,
  project: Project,
  page: PageData,
  scale = 1,
): LyricBoxMetrics {
  const fontPx = FONT_PX[project.fontSize] * scale
  const lineHeight = fontPx * 1.35
  const padX = 56 * scale
  const padY = 36 * scale
  const maxTextW = PAGE_W * scale - 240 * scale
  ctx.font = `${fontPx}px ${fontCss(project.font)}`
  const lines = page.lyric ? wrapText(ctx, page.lyric, maxTextW) : []
  const textW = lines.length ? Math.max(...lines.map((l) => ctx.measureText(l).width)) : 0
  const w = Math.min(PAGE_W * scale - 120 * scale, textW + padX * 2)
  const h = lines.length * lineHeight + padY * 2
  const x = (PAGE_W * scale - w) / 2
  const pos = effectivePosition(project, page)
  const margin = 60 * scale
  let y: number
  if (pos === 'top') y = margin
  else if (pos === 'middle') y = (PAGE_H * scale - h) / 2
  else y = PAGE_H * scale - h - margin
  return { x, y, w, h, lines, fontPx, lineHeight }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function drawLyricOverlay(
  ctx: CanvasRenderingContext2D,
  project: Project,
  page: PageData,
  scale = 1,
): void {
  if (page.lyric) {
    const m = measureLyricBox(ctx, project, page, scale)
    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,0.82)'
    roundRect(ctx, m.x, m.y, m.w, m.h, 24 * scale)
    ctx.fill()
    ctx.fillStyle = '#111111'
    ctx.font = `${m.fontPx}px ${fontCss(project.font)}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    m.lines.forEach((line, i) => {
      ctx.fillText(line, PAGE_W * scale * 0.5, m.y + 36 * scale + (i + 0.5) * m.lineHeight)
    })
    ctx.restore()
  }
  // 페이지 번호 (우측 하단)
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.45)'
  ctx.font = `${28 * scale}px 'Pretendard Variable', Pretendard, sans-serif`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillText(String(page.index), PAGE_W * scale - 28 * scale, PAGE_H * scale - 20 * scale)
  ctx.restore()
}

export interface RenderPageOptions {
  drawing?: CanvasImageSource | null
  scale?: number
}

/** 활동지 한 페이지를 캔버스로 렌더링 (흰 배경 + [그림] + 가사 박스 + 페이지 번호) */
export function renderPageCanvas(project: Project, page: PageData, opts: RenderPageOptions = {}): HTMLCanvasElement {
  const scale = opts.scale ?? 1
  const canvas = document.createElement('canvas')
  canvas.width = PAGE_W * scale
  canvas.height = PAGE_H * scale
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  if (opts.drawing) ctx.drawImage(opts.drawing, 0, 0, canvas.width, canvas.height)
  drawLyricOverlay(ctx, project, page, scale)
  return canvas
}

/** PDF 표지: 프로젝트 제목 + 노래 제목/학급명 입력란 */
export function renderCoverCanvas(project: Project): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = PAGE_W
  canvas.height = PAGE_H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, PAGE_W, PAGE_H)

  ctx.strokeStyle = '#BFD9F2'
  ctx.lineWidth = 10
  roundRect(ctx, 60, 60, PAGE_W - 120, PAGE_H - 120, 40)
  ctx.stroke()

  ctx.fillStyle = '#006DD2'
  ctx.font = `700 64px 'Pretendard Variable', Pretendard, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('여기 있어 뮤직비디오', PAGE_W / 2, 280)

  ctx.fillStyle = '#111111'
  ctx.font = `${project.title.length > 14 ? 96 : 120}px ${fontCss(project.font)}`
  ctx.fillText(project.title, PAGE_W / 2, PAGE_H / 2 - 40)

  ctx.fillStyle = '#333333'
  ctx.font = `48px 'Pretendard Variable', Pretendard, sans-serif`
  ctx.textAlign = 'left'
  const lineY1 = PAGE_H - 400
  const lineY2 = PAGE_H - 280
  ctx.fillText('노래 제목:', 360, lineY1)
  ctx.fillText('학급:', 360, lineY2)
  ctx.strokeStyle = '#999999'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(600, lineY1 + 28)
  ctx.lineTo(1560, lineY1 + 28)
  ctx.moveTo(600, lineY2 + 28)
  ctx.lineTo(1560, lineY2 + 28)
  ctx.stroke()
  return canvas
}

export function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('이미지 변환에 실패했어요.'))),
      'image/jpeg',
      quality,
    )
  })
}
