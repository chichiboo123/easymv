// 로컬(IndexedDB) / 서버(Cloudflare) 백엔드를 한 인터페이스로 통합.
// 기본값은 'local'. URL에 ?srv=1 이 있으면 'server'.

import { ApiError, serverGetDrawing, serverGetProject, serverSaveDrawing } from './api'
import { getDrawing, getProject, saveDrawing, saveProject } from './storage'
import type { Project } from './types'

export type Source = 'local' | 'server'

export function sourceFromSearch(sp: URLSearchParams): Source {
  return sp.get('srv') === '1' ? 'server' : 'local'
}

/** 프로젝트가 서버에 올라간 상태면 링크에 붙일 쿼리스트링 */
export function srvSuffix(p: Pick<Project, 'publishedToServer'>): string {
  return p.publishedToServer ? '?srv=1' : ''
}

export async function loadProject(source: Source, id: string): Promise<Project | undefined> {
  return source === 'server' ? serverGetProject(id) : getProject(id)
}

export interface LoadedDrawing {
  blob: Blob
  updatedAt: string | null
  ops?: string
}

export async function loadDrawing(source: Source, id: string, index: number): Promise<LoadedDrawing | undefined> {
  if (source === 'server') {
    const blob = await serverGetDrawing(id, index)
    return blob ? { blob, updatedAt: null } : undefined
  }
  const rec = await getDrawing(id, index)
  return rec ? { blob: rec.blob, updatedAt: rec.updatedAt, ops: rec.ops } : undefined
}

export interface StudentSaveResult {
  updatedAt: string
  conflict?: { updatedAt: string; studentName: string | null }
}

/**
 * 학생 그림 저장. 로컬은 IndexedDB + 로컬 프로젝트 상태 갱신,
 * 서버는 R2 업로드 + KV 상태 갱신(+충돌 감지).
 */
export async function saveStudentDrawing(
  source: Source,
  project: Project,
  index: number,
  blob: Blob,
  opts: { ops?: string; studentName?: string | null; base?: string | null; markDone: boolean; force?: boolean },
): Promise<StudentSaveResult> {
  if (source === 'server') {
    try {
      const r = await serverSaveDrawing(project.projectId, index, blob, {
        studentName: opts.studentName,
        base: opts.base,
        force: opts.force,
        done: opts.markDone,
      })
      return { updatedAt: r.updatedAt }
    } catch (e) {
      if (e instanceof ApiError && e.isConflict) {
        const d = (e.data ?? {}) as { updatedAt?: string; studentName?: string | null }
        return {
          updatedAt: opts.base ?? '',
          conflict: { updatedAt: d.updatedAt ?? '', studentName: d.studentName ?? null },
        }
      }
      throw e
    }
  }

  // 로컬
  const now = new Date().toISOString()
  await saveDrawing(project.projectId, index, { blob, ops: opts.ops, updatedAt: now })
  const p = await getProject(project.projectId)
  if (p) {
    const pages = p.pages.map((pg) =>
      pg.index === index
        ? {
            ...pg,
            status: opts.markDone ? ('done' as const) : ('drawing' as const),
            studentName: opts.studentName?.trim() || pg.studentName,
            updatedAt: now,
          }
        : pg,
    )
    await saveProject({ ...p, pages })
  }
  return { updatedAt: now }
}
