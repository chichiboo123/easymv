import { openDB, type IDBPDatabase } from 'idb'
import type { EditorState, Project } from './types'

const DB_NAME = 'easymv'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase> | null = null

function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'projectId' })
        if (!d.objectStoreNames.contains('drawings')) d.createObjectStore('drawings')
        if (!d.objectStoreNames.contains('editorStates')) d.createObjectStore('editorStates', { keyPath: 'projectId' })
        if (!d.objectStoreNames.contains('uploads')) d.createObjectStore('uploads')
      },
    })
  }
  return dbPromise
}

// ---------- 프로젝트 ----------
export async function saveProject(p: Project): Promise<void> {
  await (await db()).put('projects', p)
}

export async function getProject(projectId: string): Promise<Project | undefined> {
  return (await db()).get('projects', projectId)
}

export async function listProjects(): Promise<Project[]> {
  const all: Project[] = await (await db()).getAll('projects')
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function deleteProject(projectId: string): Promise<void> {
  const d = await db()
  await d.delete('projects', projectId)
  await d.delete('editorStates', projectId)
  const keys = (await d.getAllKeys('drawings')) as string[]
  for (const k of keys) if (k.startsWith(projectId + ':')) await d.delete('drawings', k)
  const upKeys = (await d.getAllKeys('uploads')) as string[]
  for (const k of upKeys) if (k.startsWith(projectId + ':')) await d.delete('uploads', k)
}

// ---------- 그림 (JPG Blob) ----------
export interface DrawingRecord {
  blob: Blob
  /** 벡터 작업 내역(이어 그리기용 JSON). 용량 절약을 위해 선택 저장 */
  ops?: string
  updatedAt: string
}

const drawingKey = (projectId: string, pageIndex: number) => `${projectId}:${pageIndex}`

export async function saveDrawing(projectId: string, pageIndex: number, rec: DrawingRecord): Promise<void> {
  await (await db()).put('drawings', rec, drawingKey(projectId, pageIndex))
}

export async function getDrawing(projectId: string, pageIndex: number): Promise<DrawingRecord | undefined> {
  return (await db()).get('drawings', drawingKey(projectId, pageIndex))
}

export async function deleteDrawing(projectId: string, pageIndex: number): Promise<void> {
  await (await db()).delete('drawings', drawingKey(projectId, pageIndex))
}

// ---------- 편집기 상태 ----------
export async function saveEditorState(s: EditorState): Promise<void> {
  await (await db()).put('editorStates', s)
}

export async function getEditorState(projectId: string): Promise<EditorState | undefined> {
  return (await db()).get('editorStates', projectId)
}

// ---------- 편집기 업로드 이미지 ----------
export async function saveUploadImage(projectId: string, clipId: string, blob: Blob): Promise<void> {
  await (await db()).put('uploads', blob, `${projectId}:${clipId}`)
}

export async function getUploadImage(projectId: string, clipId: string): Promise<Blob | undefined> {
  return (await db()).get('uploads', `${projectId}:${clipId}`)
}

export async function deleteUploadImage(projectId: string, clipId: string): Promise<void> {
  await (await db()).delete('uploads', `${projectId}:${clipId}`)
}
