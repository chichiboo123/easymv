import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import Layout from '../components/Layout'
import { LYRIC_FONTS, ensureAllFontLinks, fontCss, loadFontForCanvas } from '../lib/fonts'
import { exportPageJpg, exportPdf, exportZip } from '../lib/exporters'
import { renderPageCanvas } from '../lib/render'
import { getDrawing, getProject, saveProject } from '../lib/storage'
import { studentLink, teacherLink } from '../lib/share'
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
  const [params] = useSearchParams()
  const editId = params.get('id')
  const [project, setProject] = useState<Project>(newProject)
  const [lyricsText, setLyricsText] = useState('')
  const [loadedFromStore, setLoadedFromStore] = useState(false)
  const [fontOpen, setFontOpen] = useState(false)
  const [previews, setPreviews] = useState<string[]>([])
  const [exporting, setExporting] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [copied, setCopied] = useState<string | null>(null)
  const [qrUrl, setQrUrl] = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 기존 프로젝트 불러오기
  useEffect(() => {
    if (!editId) {
      setLoadedFromStore(true)
      return
    }
    getProject(editId).then((p) => {
      if (p) {
        setProject(p)
        setLyricsText(p.pages.map((pg) => pg.lyric).join('\n'))
      }
      setLoadedFromStore(true)
    })
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
    }, 700)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [project, loadedFromStore])

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
      <h1>활동지 만들기</h1>
      <div className="create-layout">
        {/* ---------- 입력 ---------- */}
        <div className="form-stack">
          <div className="card form-stack">
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
            <h2 style={{ margin: 0 }}>페이지 디자인</h2>
            <div>
              <span className="field">가사 위치 (전체 적용)</span>
              <div className="seg" role="group" aria-label="가사 위치">
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
              <div className="seg" role="group" aria-label="폰트 크기">
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
            <h2 style={{ margin: 0 }}>내보내기</h2>
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

          {/* ---------- 공유 ---------- */}
          <div className="card share-box">
            <h2 style={{ margin: 0 }}>공유</h2>
            <div>
              <span className="field">학생용 그리기 링크</span>
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
              <span>
                이 앱은 서버 없이 동작해요. 프로젝트 설정은 링크 속에 담겨 전달되고, 그림은 각 기기의 브라우저에만
                저장돼요. 학생 이름은 선택 입력이며 어떤 계정 정보도 수집하지 않아요.
              </span>
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
