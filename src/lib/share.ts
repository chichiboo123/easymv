import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { Project, SharedProject } from './types'

/**
 * 백엔드 없는 구조에서 프로젝트 설정을 URL에 압축해 담습니다.
 * 그림 데이터는 포함되지 않습니다(각 기기 브라우저에 저장).
 */
export function encodeProject(p: Project, includePin: boolean): string {
  const shared: SharedProject = {
    v: 1,
    projectId: p.projectId,
    title: p.title,
    font: p.font,
    fontSize: p.fontSize,
    lyricPosition: p.lyricPosition,
    requireName: p.requireName,
    studentCount: p.studentCount,
    pages: p.pages.map((pg) => ({ lyric: pg.lyric, position: pg.position })),
  }
  if (includePin) shared.pin = p.pin
  return compressToEncodedURIComponent(JSON.stringify(shared))
}

export function decodeShared(data: string): SharedProject | null {
  try {
    const json = decompressFromEncodedURIComponent(data)
    if (!json) return null
    const obj = JSON.parse(json) as SharedProject
    if (obj.v !== 1 || !obj.projectId || !Array.isArray(obj.pages)) return null
    return obj
  } catch {
    return null
  }
}

export function sharedToProject(s: SharedProject): Project {
  return {
    projectId: s.projectId,
    pin: s.pin ?? '',
    title: s.title,
    createdAt: new Date().toISOString(),
    studentCount: s.studentCount,
    font: s.font,
    fontSize: s.fontSize,
    lyricPosition: s.lyricPosition,
    requireName: s.requireName,
    pages: s.pages.map((pg, i) => ({
      index: i + 1,
      lyric: pg.lyric,
      position: pg.position,
      studentName: null,
      status: 'empty',
      updatedAt: null,
    })),
  }
}

// 서버에 올린 프로젝트는 코드만 담은 짧은 링크(?srv=1)를 쓰고,
// 그렇지 않으면 설정 전체를 URL에 압축해 담는 로컬 링크를 씁니다.

export function studentLink(p: Project): string {
  if (p.publishedToServer) return `${location.origin}/draw/${p.projectId}?srv=1`
  return `${location.origin}/draw/${p.projectId}?d=${encodeProject(p, false)}`
}

export function teacherLink(p: Project): string {
  return `${location.origin}/t/${p.projectId}?d=${encodeProject(p, true)}`
}

export function editorLink(p: Project): string {
  return `${location.origin}/edit/${p.projectId}${p.publishedToServer ? '?srv=1' : ''}`
}

export function viewerLink(projectId: string, pageIndex: number, server = false): string {
  return `${location.origin}/view/${projectId}/${pageIndex}${server ? '?srv=1' : ''}`
}
