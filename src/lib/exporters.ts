import { getDrawing } from './storage'
import { canvasToJpegBlob, renderCoverCanvas, renderPageCanvas } from './render'
import { loadFontForCanvas } from './fonts'
import { downloadBlob } from './util'
import type { PageData, Project } from './types'

// PDF/ZIP 라이브러리는 무거워서 실제 내보내기를 누를 때만 내려받음 (첫 화면 로딩 속도 확보)
const loadJsPdf = async () => (await import('jspdf')).jsPDF
const loadJsZip = async () => (await import('jszip')).default

async function drawingBitmap(projectId: string, pageIndex: number): Promise<ImageBitmap | null> {
  const rec = await getDrawing(projectId, pageIndex)
  if (!rec) return null
  try {
    return await createImageBitmap(rec.blob)
  } catch {
    return null
  }
}

/**
 * 페이지를 그림과 함께 렌더링.
 * drawingBlob을 넘기면(undefined가 아니면) 그 그림을 사용하고, 아니면 로컬 IndexedDB에서 찾습니다.
 * (서버 그림이나 그리기 화면의 현재 캔버스를 바로 넘길 때 사용)
 */
export async function renderPageWithDrawing(
  project: Project,
  page: PageData,
  drawingBlob?: Blob | null,
): Promise<HTMLCanvasElement> {
  await loadFontForCanvas(project.font, page.lyric + project.title)
  let bmp: ImageBitmap | null
  if (drawingBlob !== undefined) {
    bmp = drawingBlob ? await createImageBitmap(drawingBlob).catch(() => null) : null
  } else {
    bmp = await drawingBitmap(project.projectId, page.index)
  }
  const canvas = renderPageCanvas(project, page, { drawing: bmp })
  bmp?.close()
  return canvas
}

/** 전체 페이지(표지 포함)를 PDF 한 파일로 */
export async function exportPdf(project: Project, onProgress?: (done: number, total: number) => void): Promise<void> {
  const jsPDF = await loadJsPdf()
  await loadFontForCanvas(project.font, project.title + project.pages.map((p) => p.lyric).join(''))
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = 297
  const H = 210
  const total = project.pages.length + 1

  const cover = renderCoverCanvas(project)
  pdf.addImage(cover.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, W, H)
  onProgress?.(1, total)

  for (let i = 0; i < project.pages.length; i++) {
    const page = project.pages[i]
    const canvas = await renderPageWithDrawing(project, page)
    pdf.addPage('a4', 'landscape')
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, W, H)
    onProgress?.(i + 2, total)
  }
  pdf.save(`${project.title || 'easymv'}_활동지.pdf`)
}

/** 한 페이지 JPG 다운로드 */
export async function exportPageJpg(project: Project, page: PageData, drawingBlob?: Blob | null): Promise<void> {
  const canvas = await renderPageWithDrawing(project, page, drawingBlob)
  const blob = await canvasToJpegBlob(canvas)
  downloadBlob(blob, `${project.title || 'easymv'}_${String(page.index).padStart(2, '0')}.jpg`)
}

/** 한 페이지 PDF 다운로드 (학생용) */
export async function exportPagePdf(project: Project, page: PageData, drawingBlob?: Blob | null): Promise<void> {
  const jsPDF = await loadJsPdf()
  const canvas = await renderPageWithDrawing(project, page, drawingBlob)
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, 297, 210)
  pdf.save(`${project.title || 'easymv'}_${String(page.index).padStart(2, '0')}.pdf`)
}

/** 전체 JPG를 ZIP으로 */
export async function exportZip(project: Project, onProgress?: (done: number, total: number) => void): Promise<void> {
  const JSZip = await loadJsZip()
  const zip = new JSZip()
  const total = project.pages.length
  for (let i = 0; i < project.pages.length; i++) {
    const page = project.pages[i]
    const canvas = await renderPageWithDrawing(project, page)
    const blob = await canvasToJpegBlob(canvas)
    zip.file(`${String(page.index).padStart(2, '0')}.jpg`, blob)
    onProgress?.(i + 1, total)
  }
  const out = await zip.generateAsync({ type: 'blob' })
  downloadBlob(out, `${project.title || 'easymv'}_활동지.zip`)
}
