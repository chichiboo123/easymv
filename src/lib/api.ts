import { API_BASE, getAdminKey } from './config'
import type { Project } from './types'

export class ApiError extends Error {
  status: number
  data: unknown
  constructor(status: number, data: unknown) {
    super(`API ${status}`)
    this.status = status
    this.data = data
  }
  get isConflict() {
    return this.status === 409
  }
}

async function parse(res: Response): Promise<unknown> {
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) throw new ApiError(res.status, data)
  return data
}

/** 서버에 저장할 형태 (그림 바이트는 별도 R2로) */
function toServerProject(p: Project) {
  return {
    projectId: p.projectId,
    pin: p.pin,
    title: p.title,
    createdAt: p.createdAt,
    studentCount: p.studentCount,
    font: p.font,
    fontSize: p.fontSize,
    lyricPosition: p.lyricPosition,
    requireName: p.requireName,
    pages: p.pages.map((pg) => ({
      index: pg.index,
      lyric: pg.lyric,
      position: pg.position,
      studentName: pg.studentName,
      status: pg.status,
      updatedAt: pg.updatedAt,
    })),
  }
}

/** 서버 응답(JSON)을 앱 Project로. 공개 조회에는 pin이 없음. */
function fromServer(raw: Record<string, unknown>): Project {
  const pages = (raw.pages as Project['pages']) ?? []
  return {
    projectId: String(raw.projectId ?? ''),
    pin: String(raw.pin ?? ''),
    title: String(raw.title ?? ''),
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    studentCount: Number(raw.studentCount ?? pages.length),
    font: String(raw.font ?? 'Jua'),
    fontSize: (raw.fontSize as Project['fontSize']) ?? 'md',
    lyricPosition: (raw.lyricPosition as Project['lyricPosition']) ?? 'bottom',
    requireName: Boolean(raw.requireName),
    publishedToServer: true,
    pages: pages.map((pg, i) => ({
      index: pg.index ?? i + 1,
      lyric: pg.lyric ?? '',
      position: pg.position ?? null,
      studentName: pg.studentName ?? null,
      status: pg.status ?? 'empty',
      updatedAt: pg.updatedAt ?? null,
    })),
  }
}

export async function serverCreate(p: Project): Promise<void> {
  await parse(
    await fetch(`${API_BASE}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': getAdminKey() },
      body: JSON.stringify(toServerProject(p)),
    }),
  )
}

export async function serverUpdate(p: Project): Promise<void> {
  await parse(
    await fetch(`${API_BASE}/api/projects/${p.projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': getAdminKey(), 'X-Pin': p.pin },
      body: JSON.stringify(toServerProject(p)),
    }),
  )
}

export async function serverGetProject(id: string): Promise<Project | undefined> {
  try {
    const raw = (await parse(await fetch(`${API_BASE}/api/projects/${id}`))) as Record<string, unknown>
    return fromServer(raw)
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return undefined
    throw e
  }
}

export async function serverAuth(id: string, pin: string): Promise<boolean> {
  try {
    const r = (await parse(
      await fetch(`${API_BASE}/api/projects/${id}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      }),
    )) as { ok: boolean }
    return Boolean(r.ok)
  } catch {
    return false
  }
}

export async function serverGetDrawing(id: string, index: number): Promise<Blob | undefined> {
  const res = await fetch(`${API_BASE}/api/projects/${id}/pages/${index}/drawing`)
  if (res.status === 404) return undefined
  if (!res.ok) throw new ApiError(res.status, null)
  return res.blob()
}

export interface SaveResult {
  updatedAt: string
}

export async function serverSaveDrawing(
  id: string,
  index: number,
  blob: Blob,
  opts: { studentName?: string | null; base?: string | null; force?: boolean; done?: boolean },
): Promise<SaveResult> {
  const params = new URLSearchParams()
  if (opts.studentName) params.set('name', opts.studentName)
  if (opts.base) params.set('base', opts.base)
  if (opts.force) params.set('force', '1')
  if (opts.done) params.set('done', '1')
  const r = (await parse(
    await fetch(`${API_BASE}/api/projects/${id}/pages/${index}/drawing?${params.toString()}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: blob,
    }),
  )) as SaveResult
  return r
}

export async function serverDelete(id: string, pin: string): Promise<void> {
  await parse(
    await fetch(`${API_BASE}/api/projects/${id}`, {
      method: 'DELETE',
      headers: { 'X-Admin-Key': getAdminKey(), 'X-Pin': pin },
    }),
  )
}
