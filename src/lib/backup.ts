import { getUploadImage, listUploadClipIds, saveEditorState, saveUploadImage } from './storage'
import type { EditorState } from './types'

/** 뮤직비디오 편집 백업 파일 포맷 (.emv.json) — 편집 상태 + 업로드 이미지 (음원 제외) */
export interface MvBackup {
  app: 'easymv-mv'
  v: 1
  title: string
  createdAt: string
  editorState: EditorState
  /** clipId → data URL */
  images: Record<string, string>
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

async function dataURLToBlob(url: string): Promise<Blob> {
  const res = await fetch(url)
  return res.blob()
}

/** 현재 편집 상태와 업로드 이미지를 백업 Blob(JSON)으로 만든다 */
export async function buildBackup(storageId: string, title: string, editorState: EditorState): Promise<Blob> {
  const clipIds = await listUploadClipIds(storageId)
  const images: Record<string, string> = {}
  for (const clipId of clipIds) {
    const blob = await getUploadImage(storageId, clipId)
    if (blob) images[clipId] = await blobToDataURL(blob)
  }
  const backup: MvBackup = {
    app: 'easymv-mv',
    v: 1,
    title,
    createdAt: new Date().toISOString(),
    editorState,
    images,
  }
  return new Blob([JSON.stringify(backup)], { type: 'application/json' })
}

export async function readBackupFile(file: File): Promise<MvBackup> {
  const text = await file.text()
  const data = JSON.parse(text) as MvBackup
  if (data?.app !== 'easymv-mv' || !data.editorState) {
    throw new Error('easymv 뮤직비디오 백업 파일이 아니에요.')
  }
  return data
}

/** 백업을 현재 편집 슬롯(storageId)에 적용: 이미지 저장 + 편집 상태 저장. 적용된 EditorState 반환 */
export async function applyBackup(storageId: string, backup: MvBackup): Promise<EditorState> {
  for (const [clipId, url] of Object.entries(backup.images)) {
    try {
      await saveUploadImage(storageId, clipId, await dataURLToBlob(url))
    } catch {
      // 개별 이미지 오류는 건너뜀
    }
  }
  const es: EditorState = { ...backup.editorState, projectId: storageId, updatedAt: new Date().toISOString() }
  await saveEditorState(es)
  return es
}
