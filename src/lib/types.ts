export type LyricPosition = 'top' | 'middle' | 'bottom'
export type FontSize = 'sm' | 'md' | 'lg'
export type PageStatus = 'empty' | 'drawing' | 'done'

export interface PageData {
  index: number
  lyric: string
  /** 페이지별 가사 위치 오버라이드 (null이면 프로젝트 기본값) */
  position: LyricPosition | null
  studentName: string | null
  status: PageStatus
  updatedAt: string | null
}

export interface Project {
  projectId: string
  pin: string
  title: string
  createdAt: string
  studentCount: number
  font: string
  fontSize: FontSize
  lyricPosition: LyricPosition
  requireName: boolean
  /** 관리자가 이 프로젝트를 서버에 올렸는지 (그러면 공유 링크가 서버 모드로 전환) */
  publishedToServer?: boolean
  pages: PageData[]
}

/** URL 공유용으로 직렬화되는 최소 데이터 (그림 제외) */
export interface SharedProject {
  v: 1
  projectId: string
  title: string
  font: string
  fontSize: FontSize
  lyricPosition: LyricPosition
  requireName: boolean
  studentCount: number
  pages: { lyric: string; position: LyricPosition | null }[]
  /** 교사 공유 링크에만 포함 */
  pin?: string
}

export type TransitionType = 'cut' | 'fade' | 'dissolve' | 'slideL' | 'slideR' | 'zoomIn' | 'zoomOut'

export interface ClipData {
  id: string
  /** 프로젝트 페이지에서 온 경우 페이지 index, 업로드 이미지는 null */
  pageIndex: number | null
  label: string
  duration: number
}

export interface TransitionData {
  type: TransitionType
  duration: number
}

export interface EditorState {
  projectId: string
  clips: ClipData[]
  /** transitions[i] = clips[i]와 clips[i+1] 사이 */
  transitions: TransitionData[]
  kenBurns: boolean
  showLyricOverlay: boolean
  intro: boolean
  outro: boolean
  className: string
  updatedAt: string
}
