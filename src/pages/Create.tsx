import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import Layout from '../components/Layout'
import StepTitle from '../components/StepTitle'
import { LYRIC_FONTS, ensureAllFontLinks, fontCss, loadFontForCanvas } from '../lib/fonts'
import { exportPageJpg, exportPdf, exportZip } from '../lib/exporters'
import { renderPageCanvas } from '../lib/render'
import { getDrawing, getProject, saveProject } from '../lib/storage'
import { studentLink, teacherLink } from '../lib/share'
import { ApiError, serverCreate, serverHealth, serverUpdate, type HealthResult } from '../lib/api'
import { API_BASE, isAdmin, serverConfigured } from '../lib/config'
import { copyText, genPin, genProjectId, splitLyrics } from '../lib/util'
import type { FontSize, LyricPosition, PageData, Project } from '../lib/types'

const POSITIONS: { v: LyricPosition; label: string }[] = [
  { v: 'top', label: '상단' },
  { v: 'middle', label: '중앙' },
  { v: 'bottom', label: '하단' },
]
const SIZES: { v: FontSize; label: string }[] = [
  { v: 'sm', label: '소' },
  { v: 'md', label: '중' },
  { v: 'lg', label: '대' },
]

/** 마지막으로 편집하던 활동지 id (새로고침 시 이어서 편집) */
const DRAFT_KEY = 'easymv_draft_id'
const HISTORY_MAX = 60

interface Snapshot {
  project: Project
  lyricsText: string
}

function newProject(): Project {
  return {
    projectId: genProjectId(),
    pin: genPin(),
    title: '',
    createdAt: new Date().toISOString(),
    studentCount: 20,
    font: 'Jua',
    fontSize: 'md',
    lyricPosition: 'bottom',
    requireName: false,
    pages: [],
  }
}

export default function Create() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editId = params.get('id')
  const [project, setProject] = useState<Project>(newProject)
  const [lyricsText, setLyricsText] = useState('')
  const [loadedFromStore, setLoadedFromStore] = useState(false)
  // 실행취소/다시실행 히스토리
  const histRef = useRef<{ stack: string[]; idx: number }>({ stack: [], idx: -1 })
  const restoringRef = useRef(false)
  const [hist, setHist] = useState({ canUndo: false, canRedo: false })
  const [fontOpen, setFontOpen] = useState(false)
  const [previews, setPreviews] = useState<string[]>([])
  const [exporting, setExporting] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [copied, setCopied] = useState<string | null>(null)
  const [qrUrl, setQrUrl] = useState('')
  const [admin, setAdmin] = useState(isAdmin())
  const [publishing, setPublishing] = useState(false)
  const [publishMsg, setPublishMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [health, setHealth] = useState<HealthResult | 'checking' | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const testServer = useCallback(async () => {
    setHealth('checking')
    setHealth(await serverHealth())
  }, [])

  useEffect(() => {
    const onChange = () => setAdmin(isAdmin())
    window.addEventListener('easymv-admin-change', onChange)
    return () => window.removeEventListener('easymv-admin-change', onChange)
  }, [])

  const publishToServer = useCallback(async () => {
    setPublishing(true)
    setPublishMsg(null)
    try {
      if (project.publishedToServer) await serverUpdate(project)
      else await serverCreate(project)
      const updated = { ...project, publishedToServer: true }
      setProject(updated)
      await saveProject(updated)
      setPublishMsg({ ok: true, text: '서버에 올렸어요! 학생 링크(QR)로 다른 기기에서 접속·제출할 수 있어요.' })
    } catch (e) {
      if (e instanceof ApiError && e.status === 401)
        setPublishMsg({ ok: false, text: '관리자 키가 올바르지 않아요. 로고를 5번 눌러 다시 입력해 주세요.' })
      else setPublishMsg({ ok: false, text: '서버 연결에 실패했어요. 잠시 후 다시 시도해 주세요.' })
    } finally {
      setPublishing(false)
    }
  }, [project])

  // 기존 프로젝트 불러오기 (id 지정 or 마지막 초안 이어서)
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      let loaded: Project | null = null
      let lyrics = ''
      if (editId) {
        const p = await getProject(editId)
        if (p) {
          loaded = p
          lyrics = p.pages.map((pg) => pg.lyric).join('\n')
          localStorage.setItem(DRAFT_KEY, p.projectId)
        }
      } else {
        const draftId = localStorage.getItem(DRAFT_KEY)
        if (draftId) {
          const p = await getProject(draftId)
          if (p) {
            loaded = p
            lyrics = p.pages.map((pg) => pg.lyric).join('\n')
          }
        }
      }
      if (cancelled) return
      if (loaded) {
        setProject(loaded)
        setLyricsText(lyrics)
      }
      // 히스토리 시드 (현재 상태를 첫 스냅샷으로)
      const base: Snapshot = { project: loaded ?? project, lyricsText: loaded ? lyrics : lyricsText }
      histRef.current = { stack: [JSON.stringify(base)], idx: 0 }
      setHist({ canUndo: false, canRedo: false })
      setLoadedFromStore(true)
    }
    init()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId])

  useEffect(() => {
    ensureAllFontLinks()
  }, [])

  // 가사 텍스트 → 페이지 배열 (기존 페이지의 오버라이드·그림 상태 유지)
  const update = useCallback((patch: Partial<Project>) => {
    setProject((prev) => ({ ...prev, ...patch }))
  }, [])

  const onLyricsChange = useCallback((text: string) => {
    setLyricsText(text)
    const lines = splitLyrics(text)
    setProject((prev) => {
      const pages: PageData[] = lines.map((lyric, i) => {
        const old = prev.pages[i]
        return {
          index: i + 1,
          lyric,
          position: old?.position ?? null,
          studentName: old?.studentName ?? null,
          status: old?.status ?? 'empty',
          updatedAt: old?.updatedAt ?? null,
        }
      })
      return { ...prev, pages }
    })
  }, [])

  // 자동 저장 (700ms 디바운스)
  useEffect(() => {
    if (!loadedFromStore) return
    if (!project.title && project.pages.length === 0) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveProject(project)
      localStorage.setItem(DRAFT_KEY, project.projectId)
    }, 700)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [project, loadedFromStore])

  // 히스토리 기록 (450ms 디바운스, 복원 중에는 건너뜀)
  useEffect(() => {
    if (!loadedFromStore) return
    if (restoringRef.current) {
      restoringRef.current = false
      return
    }
    const t = setTimeout(() => {
      const snap = JSON.stringify({ project, lyricsText })
      const h = histRef.current
      if (h.stack[h.idx] === snap) return
      const stack = h.stack.slice(0, h.idx + 1)
      stack.push(snap)
      while (stack.length > HISTORY_MAX) stack.shift()
      histRef.current = { stack, idx: stack.length - 1 }
      setHist({ canUndo: histRef.current.idx > 0, canRedo: false })
    }, 450)
    return () => clearTimeout(t)
  }, [project, lyricsText, loadedFromStore])

  const applySnapshot = (snap: string) => {
    const s = JSON.parse(snap) as Snapshot
    restoringRef.current = true
    setProject(s.project)
    setLyricsText(s.lyricsText)
  }
  const undo = useCallback(() => {
    const h = histRef.current
    if (h.idx <= 0) return
    h.idx -= 1
    applySnapshot(h.stack[h.idx])
    setHist({ canUndo: h.idx > 0, canRedo: h.idx < h.stack.length - 1 })
  }, [])
  const redo = useCallback(() => {
    const h = histRef.current
    if (h.idx >= h.stack.length - 1) return
    h.idx += 1
    applySnapshot(h.stack[h.idx])
    setHist({ canUndo: h.idx > 0, canRedo: h.idx < h.stack.length - 1 })
  }, [])

  const resetProject = useCallback(() => {
    if (!window.confirm('지금 내용을 지우고 새 활동지를 시작할까요?\n(지금 활동지는 "내 프로젝트" 목록에 그대로 남아요)')) return
    const p = newProject()
    restoringRef.current = true
    setProject(p)
    setLyricsText('')
    setFontOpen(false)
    localStorage.setItem(DRAFT_KEY, p.projectId)
    histRef.current = { stack: [JSON.stringify({ project: p, lyricsText: '' })], idx: 0 }
    setHist({ canUndo: false, canRedo: false })
    if (editId) navigate('/create', { replace: true })
  }, [editId, navigate])

  // 단축키: Ctrl/Cmd+Z 실행취소, Ctrl/Cmd+Shift+Z(또는 Ctrl+Y) 다시실행
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  // 실시간 미리보기 렌더링
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      await loadFontForCanvas(project.font, project.pages.map((p) => p.lyric).join('') || '가나다')
      if (cancelled) return
      const urls: string[] = []
      for (const page of project.pages) {
        const drawingRec = await getDrawing(project.projectId, page.index)
        let bmp: ImageBitmap | null = null
        if (drawingRec) {
          try {
            bmp = await createImageBitmap(drawingRec.blob)
          } catch {
            bmp = null
          }
        }
        const canvas = renderPageCanvas(project, page, { scale: 0.16, drawing: bmp })
        bmp?.close()
        urls.push(canvas.toDataURL('image/jpeg', 0.7))
      }
      if (!cancelled) setPreviews(urls)
    }
    const t = setTimeout(run, 350)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [project])

  // QR 코드 (학생 링크)
  useEffect(() => {
    if (project.pages.length === 0) {
      setQrUrl('')
      return
    }
    QRCode.toDataURL(studentLink(project), { width: 320, margin: 1 })
      .then(setQrUrl)
      .catch(() => setQrUrl(''))
  }, [project])

  const pageCount = project.pages.length
  const diff = project.studentCount - pageCount
  const countNotice = useMemo(() => {
    if (pageCount === 0 || diff === 0) return null
    if (diff > 0) return `페이지 ${pageCount}개 / 학생 ${project.studentCount}명 — ${diff}명은 페이지가 없어요.`
    return `페이지 ${pageCount}개 / 학생 ${project.studentCount}명 — 학생 한 명이 여러 페이지를 맡게 돼요.`
  }, [pageCount, diff, project.studentCount])

  const setPagePosition = (i: number, pos: LyricPosition | null) => {
    setProject((prev) => {
      const pages = prev.pages.map((p, idx) => (idx === i ? { ...p, position: pos } : p))
      return { ...prev, pages }
    })
  }

  const doCopy = async (key: string, text: string) => {
    await saveProject(project)
    if (await copyText(text)) {
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    }
  }

  const canExport = pageCount > 0 && !exporting

  return (
    <Layout theme="create" wide>
      <div className="edit-header">
        <h1 style={{ margin: 0 }}>활동지 만들기</h1>
        <div className="edit-actions">
          <button className="icon-btn" onClick={undo} disabled={!hist.canUndo} title="실행취소 (Ctrl+Z)" aria-label="실행취소">
            <span className="material-icons-outlined" aria-hidden="true">undo</span>
          </button>
          <button className="icon-btn" onClick={redo} disabled={!hist.canRedo} title="다시실행 (Ctrl+Shift+Z)" aria-label="다시실행">
            <span className="material-icons-outlined" aria-hidden="true">redo</span>
          </button>
          <button className="icon-btn" onClick={resetProject} title="새로 만들기 (지금 내용 비우기)" aria-label="새로 만들기">
            <span className="material-icons-outlined" aria-hidden="true">note_add</span>
          </button>
        </div>
      </div>
      <p className="sub" style={{ margin: '2px 0 14px' }}>
        입력한 내용은 이 브라우저에 자동 저장돼요. 새로고침해도 이어서 편집할 수 있어요.
      </p>
      <div className="create-layout">
        {/* ---------- 입력 ---------- */}
        <div className="form-stack">
          <div className="card form-stack">
            <StepTitle n={1} title="가사 입력" desc="한 줄이 한 페이지가 돼요" />
            <div>
              <label className="field" htmlFor="title">
                프로젝트 제목
              </label>
              <input
                id="title"
                type="text"
                placeholder="예: 우리 반 봄 노래 뮤직비디오"
                value={project.title}
                onChange={(e) => update({ title: e.target.value })}
              />
            </div>
            <div>
              <label className="field" htmlFor="students">
                학생 수
              </label>
              <input
                id="students"
                type="number"
                min={1}
                max={40}
                value={project.studentCount}
                onChange={(e) =>
                  update({ studentCount: Math.max(1, Math.min(40, Number(e.target.value) || 1)) })
                }
              />
            </div>
            <div>
              <label className="field" htmlFor="lyrics">
                가사 입력
              </label>
              <p className="sub" style={{ margin: '0 0 6px' }}>
                한 줄이 한 페이지가 됩니다. 줄바꿈(Enter)으로 페이지를 나눠주세요.
              </p>
              <textarea
                id="lyrics"
                rows={10}
                placeholder={'봄바람이 불어오면\n꽃잎이 춤을 춰요\n…'}
                value={lyricsText}
                onChange={(e) => onLyricsChange(e.target.value)}
              />
            </div>
            {countNotice && (
              <span className="badge warn">
                <span className="material-icons-outlined" style={{ fontSize: 18 }} aria-hidden="true">
                  info
                </span>
                {countNotice}
              </span>
            )}
          </div>

          {/* ---------- 디자인 옵션 ---------- */}
          <div className="card form-stack">
            <StepTitle n={2} title="페이지 디자인" desc="미리보기를 보며 골라요" />
            <div>
              <span className="field">가사 위치 (전체 적용)</span>
              <div className="seg seg-full" role="group" aria-label="가사 위치">
                {POSITIONS.map((p) => (
                  <button
                    key={p.v}
                    className={project.lyricPosition === p.v ? 'on' : ''}
                    onClick={() => update({ lyricPosition: p.v })}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="field">폰트 크기</span>
              <div className="seg seg-full" role="group" aria-label="폰트 크기">
                {SIZES.map((s) => (
                  <button
                    key={s.v}
                    className={project.fontSize === s.v ? 'on' : ''}
                    onClick={() => update({ fontSize: s.v })}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="field">가사 폰트</span>
              <button
                className="btn ghost"
                style={{ width: '100%', justifyContent: 'space-between', fontFamily: fontCss(project.font) }}
                onClick={() => setFontOpen((v) => !v)}
                aria-expanded={fontOpen}
              >
                {project.font}
                <span className="material-icons-outlined" aria-hidden="true">
                  {fontOpen ? 'expand_less' : 'expand_more'}
                </span>
              </button>
              {fontOpen && (
                <div
                  style={{
                    maxHeight: 280,
                    overflowY: 'auto',
                    border: '1.5px solid var(--border)',
                    borderRadius: 8,
                    marginTop: 6,
                    background: '#fff',
                  }}
                >
                  {LYRIC_FONTS.map((f) => (
                    <button
                      key={f.name}
                      onClick={() => {
                        update({ font: f.name })
                        setFontOpen(false)
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '10px 14px',
                        border: 'none',
                        background: project.font === f.name ? 'var(--primary-light)' : 'transparent',
                        fontFamily: f.css,
                        fontSize: '1.15rem',
                        cursor: 'pointer',
                        minHeight: 44,
                      }}
                    >
                      {f.name} — {f.kind === 'ko' ? '우리 반 노래' : 'Sing Together'}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, cursor: 'pointer' }}>
              <input
                type="checkbox"
                style={{ width: 20, height: 20 }}
                checked={project.requireName}
                onChange={(e) => update({ requireName: e.target.checked })}
              />
              학생 이름 입력을 필수로 하기
            </label>
          </div>

          {/* ---------- 내보내기 ---------- */}
          <div className="card form-stack">
            <StepTitle n={3} title="인쇄·내보내기" desc="종이 활동지가 필요할 때" />
            <div className="option-row">
              <button
                className="btn"
                disabled={!canExport}
                onClick={async () => {
                  setExporting('pdf')
                  setProgress(0)
                  try {
                    await exportPdf(project, (d, t) => setProgress(d / t))
                  } finally {
                    setExporting(null)
                  }
                }}
              >
                <span className="material-icons-outlined" aria-hidden="true">
                  picture_as_pdf
                </span>
                PDF 다운로드
              </button>
              <button
                className="btn secondary"
                disabled={!canExport}
                onClick={async () => {
                  setExporting('zip')
                  setProgress(0)
                  try {
                    await exportZip(project, (d, t) => setProgress(d / t))
                  } finally {
                    setExporting(null)
                  }
                }}
              >
                <span className="material-icons-outlined" aria-hidden="true">
                  folder_zip
                </span>
                전체 JPG (ZIP)
              </button>
            </div>
            {exporting && (
              <div>
                <div className="progress-bar" aria-hidden="true">
                  <div style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
                <p className="sub">{exporting === 'pdf' ? 'PDF' : 'ZIP'} 만드는 중… {Math.round(progress * 100)}%</p>
              </div>
            )}
          </div>

          {/* ---------- 서버 연결 (관리자 전용) ---------- */}
          {admin && (
            <div className="card form-stack" style={{ border: '2px solid #111' }}>
              <h2 style={{ margin: 0 }}>☁️ 실시간 서버 연결 (관리자)</h2>
              <p className="sub" style={{ margin: 0 }}>
                서버에 올리면 <strong>학생이 다른 기기·집에서도</strong> 코드로 접속해 그림을 그리고, 그 그림이 자동으로
                내 뮤직비디오 편집기로 모여요.
              </p>

              {/* 서버 연결 상태 진단 */}
              <div
                className="notice"
                style={{ background: serverConfigured() ? 'var(--primary-light)' : 'var(--pastel-yellow)' }}
              >
                <span className="material-icons-outlined" aria-hidden="true">
                  {serverConfigured() ? 'dns' : 'warning'}
                </span>
                <span style={{ wordBreak: 'break-all' }}>
                  {serverConfigured() ? (
                    <>
                      서버 주소: <strong>{API_BASE}</strong>
                    </>
                  ) : (
                    <>
                      아직 <strong>서버 주소(VITE_API_BASE)</strong>가 설정되지 않았어요. 이 상태에서는 학생 그림이
                      서버로 모이지 않아요(각 기기에만 저장). GitHub 저장소 Settings → Secrets and variables → Actions →
                      Variables 에 <strong>VITE_API_BASE</strong> = 배포한 Worker 주소를 넣고 다시 배포하세요.
                    </>
                  )}
                </span>
              </div>

              <div className="option-row" style={{ alignItems: 'center' }}>
                <button className="btn secondary" onClick={testServer} disabled={health === 'checking'}>
                  <span className="material-icons-outlined" aria-hidden="true">
                    wifi_tethering
                  </span>
                  {health === 'checking' ? '확인 중…' : '연결 테스트'}
                </button>
                {health && health !== 'checking' && (
                  <span
                    className="badge"
                    style={
                      health.ok
                        ? { background: 'var(--pastel-green)', color: '#1b6e42' }
                        : { background: 'var(--pastel-pink)', color: '#a01030' }
                    }
                  >
                    {health.ok
                      ? '✅ 서버 정상 연결'
                      : health.reason === 'no_url'
                        ? '서버 주소 미설정'
                        : health.reason === 'unreachable'
                          ? '❌ 서버에 닿지 못함(주소/CORS 확인)'
                          : `❌ 응답 오류(${health.detail ?? ''})`}
                  </span>
                )}
              </div>

              <div className="option-row" style={{ alignItems: 'center' }}>
                <button
                  className="btn"
                  style={{ background: '#111' }}
                  disabled={!pageCount || publishing || !serverConfigured()}
                  onClick={publishToServer}
                >
                  <span className="material-icons-outlined" aria-hidden="true">
                    cloud_upload
                  </span>
                  {publishing ? '올리는 중…' : project.publishedToServer ? '서버에 변경사항 반영' : '서버에 올리기'}
                </button>
                {project.publishedToServer && (
                  <span className="badge" style={{ background: 'var(--pastel-green)', color: '#1b6e42' }}>
                    <span className="material-icons-outlined" style={{ fontSize: 18 }} aria-hidden="true">
                      check_circle
                    </span>
                    연결됨
                  </span>
                )}
              </div>
              {publishMsg && (
                <p className="sub" style={{ color: publishMsg.ok ? '#1b6e42' : 'var(--danger)', margin: 0 }}>
                  {publishMsg.text}
                </p>
              )}
              {project.publishedToServer && (
                <p className="sub" style={{ margin: 0 }}>
                  학생에게는 아래 <strong>학생용 그리기 링크(“실시간 연결” 배지가 붙은 것)</strong>를 공유하세요. 이
                  링크에는 <code>?srv=1</code> 이 들어있어야 서버로 그림이 모여요.
                </p>
              )}
            </div>
          )}

          {/* ---------- 공유 ---------- */}
          <div className="card share-box">
            <StepTitle n={4} title="학생과 공유" desc="링크나 QR코드를 보여주면 끝!" />
            <div>
              <span className="field">
                학생용 그리기 링크
                {project.publishedToServer && (
                  <span className="badge" style={{ marginLeft: 8, background: 'var(--pastel-green)', color: '#1b6e42' }}>
                    실시간 연결
                  </span>
                )}
              </span>
              <div className="share-row">
                <input type="text" readOnly value={pageCount ? studentLink(project) : ''} aria-label="학생용 링크" />
                <button className="btn secondary" disabled={!pageCount} onClick={() => doCopy('student', studentLink(project))}>
                  {copied === 'student' ? '복사됨!' : '복사'}
                </button>
              </div>
              {qrUrl && (
                <div className="qr-wrap" style={{ marginTop: 10 }}>
                  <img src={qrUrl} alt="학생용 링크 QR코드" />
                  <p className="sub">
                    학생 태블릿 카메라로 QR코드를 찍으면
                    <br />
                    바로 그리기 화면으로 이동해요.
                  </p>
                </div>
              )}
            </div>
            <div>
              <span className="field">교사용 복제 링크 (다른 선생님과 공유)</span>
              <div className="share-row">
                <input type="text" readOnly value={pageCount ? teacherLink(project) : ''} aria-label="교사용 링크" />
                <button className="btn secondary" disabled={!pageCount} onClick={() => doCopy('teacher', teacherLink(project))}>
                  {copied === 'teacher' ? '복사됨!' : '복사'}
                </button>
              </div>
            </div>
            <div>
              <span className="field">편집용 관리 코드 (PIN)</span>
              <div className="share-row">
                <span className="pin-display">{project.pin}</span>
                <span className="sub">뮤직비디오 편집 화면에 들어갈 때 필요해요. 잘 적어두세요!</span>
              </div>
            </div>
            <div className="notice">
              <span className="material-icons-outlined" aria-hidden="true">
                lock
              </span>
              {project.publishedToServer ? (
                <span>
                  이 프로젝트는 서버에 올라가 있어요. 학생 링크(QR)로 다른 기기에서 접속해 그림을 제출할 수 있어요. 음원과
                  영상은 서버에 올라가지 않고 내 브라우저에서만 처리돼요. 학생 이름은 선택 입력이에요.
                </span>
              ) : (
                <span>
                  이 앱은 서버 없이 동작해요. 프로젝트 설정은 링크 속에 담겨 전달되고, 그림은 각 기기의 브라우저에만
                  저장돼요. 학생 이름은 선택 입력이며 어떤 계정 정보도 수집하지 않아요.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ---------- 미리보기 ---------- */}
        <div className="card">
          <h2 style={{ marginTop: 0 }}>
            페이지 미리보기 {pageCount > 0 && <span className="badge">{pageCount}페이지</span>}
          </h2>
          {pageCount === 0 ? (
            <p className="sub">가사를 입력하면 페이지 미리보기가 여기에 나타나요.</p>
          ) : (
            <div className="preview-list">
              {project.pages.map((page, i) => (
                <div key={i} className="preview-item">
                  <span className="pnum">{page.index}</span>
                  {previews[i] ? (
                    <img src={previews[i]} alt={`${page.index}페이지: ${page.lyric}`} />
                  ) : (
                    <div style={{ aspectRatio: '1920/1358', background: '#fff', borderRadius: 10, border: '1px solid var(--border)' }} />
                  )}
                  <div className="tools">
                    <select
                      aria-label={`${page.index}페이지 가사 위치`}
                      style={{ width: 'auto', padding: '6px 8px', fontSize: '0.8rem', minHeight: 44 }}
                      value={page.position ?? ''}
                      onChange={(e) => setPagePosition(i, (e.target.value || null) as LyricPosition | null)}
                    >
                      <option value="">위치: 기본</option>
                      {POSITIONS.map((p) => (
                        <option key={p.v} value={p.v}>
                          위치: {p.label}
                        </option>
                      ))}
                    </select>
                    <button className="mini-btn" onClick={() => exportPageJpg(project, page)}>
                      <span className="material-icons-outlined" aria-hidden="true">
                        download
                      </span>
                      JPG
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
