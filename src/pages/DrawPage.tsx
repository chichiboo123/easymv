import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Modal from '../components/Modal'
import { BRUSH_SIZE, DrawingEngine, ERASER_SIZE, PALETTE, PENCIL_SIZES, type Tool } from '../lib/drawing'
import { exportPageJpg, exportPagePdf } from '../lib/exporters'
import { loadFontForCanvas } from '../lib/fonts'
import { PAGE_H, PAGE_W, drawLyricOverlay } from '../lib/render'
import { viewerLink } from '../lib/share'
import { getDrawing, getProject, saveDrawing, saveProject } from '../lib/storage'
import { copyText } from '../lib/util'
import type { Project } from '../lib/types'

interface ViewTransform {
  scale: number
  tx: number
  ty: number
}

export default function DrawPage() {
  const { projectId, pageIndex } = useParams()
  const pIdx = Number(pageIndex)
  const navigate = useNavigate()

  const [project, setProject] = useState<Project | null>(null)
  const [tool, setTool] = useState<Tool>('pencil')
  const [pencilSize, setPencilSize] = useState(1)
  const [color, setColor] = useState('#000000')
  const [, forceRender] = useState(0)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [modal, setModal] = useState<'name' | 'resume' | 'clear' | 'back' | 'done' | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [copied, setCopied] = useState(false)

  const stageRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<DrawingEngine | null>(null)
  const viewRef = useRef<ViewTransform>({ scale: 0.4, tx: 0, ty: 0 })
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<{ dist: number; scale: number; cx: number; cy: number; tx: number; ty: number } | null>(null)
  const drawingPointerRef = useRef<number | null>(null)

  const page = useMemo(() => project?.pages.find((p) => p.index === pIdx) ?? null, [project, pIdx])

  // 프로젝트·그림 불러오기
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    getProject(projectId).then(async (p) => {
      if (cancelled || !p) {
        if (!p) navigate(`/draw/${projectId}`)
        return
      }
      setProject(p)
      const pg = p.pages.find((x) => x.index === pIdx)
      setNameInput(pg?.studentName ?? '')
      if (pg?.status === 'done') setModal('resume')
      else setModal('name')
    })
    return () => {
      cancelled = true
    }
  }, [projectId, pIdx, navigate])

  // 엔진 초기화
  const initEngine = useCallback(
    async (fromScratch: boolean) => {
      if (!canvasRef.current || !projectId) return
      if (!engineRef.current) engineRef.current = new DrawingEngine(canvasRef.current)
      const rec = await getDrawing(projectId, pIdx)
      if (fromScratch) engineRef.current.reset()
      else await engineRef.current.loadState(rec?.blob ?? null, rec?.ops)
      if (fromScratch) engineRef.current.dirty = false
      forceRender((n) => n + 1)
    },
    [projectId, pIdx],
  )

  // 가사 오버레이 렌더링
  useEffect(() => {
    if (!project || !page || !overlayRef.current) return
    const overlay = overlayRef.current
    overlay.width = PAGE_W / 2
    overlay.height = PAGE_H / 2
    const ctx = overlay.getContext('2d')!
    loadFontForCanvas(project.font, page.lyric).then(() => {
      ctx.clearRect(0, 0, overlay.width, overlay.height)
      drawLyricOverlay(ctx, project, page, 0.5)
    })
  }, [project, page])

  // 화면에 맞추기
  const fitView = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return
    const sw = stage.clientWidth
    const sh = stage.clientHeight
    const scale = Math.min((sw - 24) / PAGE_W, (sh - 24) / PAGE_H)
    viewRef.current = { scale, tx: (sw - PAGE_W * scale) / 2, ty: (sh - PAGE_H * scale) / 2 }
    applyView()
  }, [])

  const applyView = () => {
    const wrap = wrapRef.current
    if (!wrap) return
    const v = viewRef.current
    wrap.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.scale})`
  }

  useEffect(() => {
    fitView()
    const onResize = () => fitView()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [fitView, project])

  // 저장
  const doSave = useCallback(
    async (markDone: boolean): Promise<boolean> => {
      const engine = engineRef.current
      if (!engine || !projectId) return false
      setSaveState('saving')
      try {
        const blob = await engine.toBlob()
        await saveDrawing(projectId, pIdx, {
          blob,
          ops: engine.serializeOps(),
          updatedAt: new Date().toISOString(),
        })
        const p = await getProject(projectId)
        if (p) {
          const pages = p.pages.map((pg) =>
            pg.index === pIdx
              ? {
                  ...pg,
                  status: markDone ? ('done' as const) : ('drawing' as const),
                  studentName: nameInput.trim() || pg.studentName,
                  updatedAt: new Date().toISOString(),
                }
              : pg,
          )
          const updated = { ...p, pages }
          await saveProject(updated)
          setProject(updated)
        }
        engine.dirty = false
        setSaveState('saved')
        setTimeout(() => setSaveState('idle'), 2000)
        return true
      } catch {
        setSaveState('error')
        return false
      }
    },
    [projectId, pIdx, nameInput],
  )

  // 30초 자동 저장
  useEffect(() => {
    const t = setInterval(() => {
      if (engineRef.current?.dirty) doSave(false)
    }, 30_000)
    return () => clearInterval(t)
  }, [doSave])

  // 새로고침/닫기 대비
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (engineRef.current?.dirty) e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // ---------- 포인터 처리 ----------
  const toCanvasPoint = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      x: ((clientX - rect.left) / rect.width) * PAGE_W,
      y: ((clientY - rect.top) / rect.height) * PAGE_H,
    }
  }

  const currentSize = tool === 'pencil' ? PENCIL_SIZES[pencilSize] : tool === 'brush' ? BRUSH_SIZE : ERASER_SIZE

  const onPointerDown = (e: React.PointerEvent) => {
    const engine = engineRef.current
    if (!engine) return
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointersRef.current.size === 2) {
      // 두 손가락: 진행 중 스트로크 취소하고 확대·이동 모드
      if (drawingPointerRef.current !== null) {
        engine.cancelStroke()
        drawingPointerRef.current = null
      }
      const pts = [...pointersRef.current.values()]
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const v = viewRef.current
      pinchRef.current = {
        dist,
        scale: v.scale,
        cx: (pts[0].x + pts[1].x) / 2,
        cy: (pts[0].y + pts[1].y) / 2,
        tx: v.tx,
        ty: v.ty,
      }
      return
    }
    if (pointersRef.current.size > 2) return

    const { x, y } = toCanvasPoint(e.clientX, e.clientY)
    if (tool === 'fill') {
      engine.fill(x, y, color)
      forceRender((n) => n + 1)
      return
    }
    drawingPointerRef.current = e.pointerId
    engine.beginStroke(tool, color, currentSize, x, y)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const engine = engineRef.current
    if (!engine) return
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }
    const pinch = pinchRef.current
    if (pinch && pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()]
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const cx = (pts[0].x + pts[1].x) / 2
      const cy = (pts[0].y + pts[1].y) / 2
      const newScale = Math.max(0.1, Math.min(4, (pinch.scale * dist) / pinch.dist))
      const stageRect = stageRef.current!.getBoundingClientRect()
      const px = pinch.cx - stageRect.left
      const py = pinch.cy - stageRect.top
      const k = newScale / pinch.scale
      viewRef.current = {
        scale: newScale,
        tx: px - k * (px - pinch.tx) + (cx - pinch.cx),
        ty: py - k * (py - pinch.ty) + (cy - pinch.cy),
      }
      applyView()
      return
    }
    if (drawingPointerRef.current === e.pointerId) {
      const { x, y } = toCanvasPoint(e.clientX, e.clientY)
      engine.moveStroke(x, y)
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
    if (drawingPointerRef.current === e.pointerId) {
      engineRef.current?.endStroke()
      drawingPointerRef.current = null
      forceRender((n) => n + 1)
    }
  }

  const goBack = () => {
    if (engineRef.current?.dirty) setModal('back')
    else navigate(`/draw/${projectId}`)
  }

  if (!project || !page) {
    return <div className="draw-screen" />
  }

  const engine = engineRef.current

  return (
    <div className="draw-screen">
      <div className="draw-topbar">
        <button className="mini-btn" onClick={goBack} aria-label="목록으로 돌아가기">
          <span className="material-icons-outlined" aria-hidden="true">
            arrow_back
          </span>
          목록
        </button>
        <span className="title">
          {page.index}. {page.lyric}
        </span>
        <span className="sub" aria-live="polite">
          {saveState === 'saving' && '저장 중…'}
          {saveState === 'saved' && '저장 완료!'}
          {saveState === 'error' && '저장 실패 — 다시 눌러 주세요'}
        </span>
        <button className="mini-btn" onClick={() => doSave(false)}>
          <span className="material-icons-outlined" aria-hidden="true">
            save
          </span>
          저장
        </button>
        <button className="btn" style={{ minHeight: 44, padding: '8px 16px' }} onClick={() => setModal('done')}>
          <span className="material-icons-outlined" aria-hidden="true">
            check_circle
          </span>
          완성!
        </button>
      </div>

      <div
        ref={stageRef}
        className="draw-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div ref={wrapRef} className="draw-canvas-wrap" style={{ width: PAGE_W, height: PAGE_H, left: 0, top: 0 }}>
          <canvas ref={canvasRef} aria-label="그림 그리는 곳" />
          <canvas
            ref={overlayRef}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
            }}
            aria-hidden="true"
          />
        </div>
      </div>

      <div className="draw-toolbar">
        <div className="tool-group" role="group" aria-label="그리기 도구">
          <button className={`tool-btn ${tool === 'pencil' ? 'on' : ''}`} onClick={() => setTool('pencil')}>
            <span className="ico" aria-hidden="true">✏️</span>연필
          </button>
          {tool === 'pencil' &&
            PENCIL_SIZES.map((s, i) => (
              <button
                key={s}
                className={`tool-btn ${pencilSize === i ? 'on' : ''}`}
                onClick={() => setPencilSize(i)}
                aria-label={`연필 굵기 ${i + 1}단계`}
              >
                <span className="size-dot" style={{ width: 6 + i * 7, height: 6 + i * 7, color: '#333' }} />
              </button>
            ))}
          <button className={`tool-btn ${tool === 'brush' ? 'on' : ''}`} onClick={() => setTool('brush')}>
            <span className="ico" aria-hidden="true">🖌️</span>붓
          </button>
          <button className={`tool-btn ${tool === 'eraser' ? 'on' : ''}`} onClick={() => setTool('eraser')}>
            <span className="ico" aria-hidden="true">🩹</span>지우개
          </button>
          <button className={`tool-btn ${tool === 'fill' ? 'on' : ''}`} onClick={() => setTool('fill')}>
            <span className="ico" aria-hidden="true">🪣</span>채우기
          </button>
        </div>

        <div className="tool-group" role="group" aria-label="색상 선택">
          {PALETTE.map((c) => (
            <button
              key={c}
              className={`color-btn ${color === c ? 'on' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`색상 ${c}`}
            />
          ))}
          <label className="tool-btn" style={{ cursor: 'pointer' }}>
            <span className="ico" aria-hidden="true">🎨</span>더 많은 색
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="sr-only"
              aria-label="더 많은 색 고르기"
            />
          </label>
        </div>

        <div className="tool-group" role="group" aria-label="편집">
          <button className="tool-btn" onClick={() => { engine?.undo(); forceRender((n) => n + 1) }} disabled={!engine?.canUndo}>
            <span className="ico" aria-hidden="true">↩️</span>실행취소
          </button>
          <button className="tool-btn" onClick={() => { engine?.redo(); forceRender((n) => n + 1) }} disabled={!engine?.canRedo}>
            <span className="ico" aria-hidden="true">↪️</span>다시실행
          </button>
          <button className="tool-btn" onClick={() => setModal('clear')}>
            <span className="ico" aria-hidden="true">🗑️</span>전체 지우기
          </button>
          <button className="tool-btn" onClick={fitView}>
            <span className="ico" aria-hidden="true">🔍</span>화면 맞춤
          </button>
        </div>
      </div>

      {/* ---------- 모달들 ---------- */}
      {modal === 'name' && (
        <Modal
          title="이름을 알려줄래요?"
          actions={
            <>
              {!project.requireName && (
                <button
                  className="btn ghost"
                  onClick={() => {
                    setModal(null)
                    initEngine(false)
                  }}
                >
                  건너뛰기
                </button>
              )}
              <button
                className="btn"
                disabled={project.requireName && !nameInput.trim()}
                onClick={() => {
                  setModal(null)
                  initEngine(false)
                }}
              >
                그리기 시작!
              </button>
            </>
          }
        >
          <p className="sub">내 그림에 이름이 함께 저장돼요.{project.requireName ? '' : ' (안 써도 괜찮아요)'}</p>
          <input
            type="text"
            placeholder="이름"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            maxLength={20}
          />
        </Modal>
      )}

      {modal === 'resume' && (
        <Modal
          title="이미 완성된 그림이 있어요"
          actions={
            <>
              <button
                className="btn danger"
                onClick={() => {
                  if (window.confirm('정말 처음부터 다시 그릴까요? 지금 그림은 지워져요.')) {
                    setModal(null)
                    initEngine(true)
                  }
                }}
              >
                처음부터
              </button>
              <button
                className="btn"
                onClick={() => {
                  setModal(null)
                  initEngine(false)
                }}
              >
                이어 그리기
              </button>
            </>
          }
        >
          <p className="sub">
            {page.studentName ? `${page.studentName} 친구가 그린 그림이 있어요.` : '먼저 그려진 그림이 있어요.'} 이어서
            그릴까요, 처음부터 그릴까요?
          </p>
        </Modal>
      )}

      {modal === 'clear' && (
        <Modal
          title="전체를 지울까요?"
          onClose={() => setModal(null)}
          actions={
            <>
              <button className="btn ghost" onClick={() => setModal(null)}>
                취소
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  engineRef.current?.clearAll()
                  setModal(null)
                  forceRender((n) => n + 1)
                }}
              >
                모두 지우기
              </button>
            </>
          }
        >
          <p className="sub">지금까지 그린 그림이 모두 지워져요. (실행취소로 되돌릴 수 있어요)</p>
        </Modal>
      )}

      {modal === 'back' && (
        <Modal
          title="저장하지 않은 그림이 있어요"
          onClose={() => setModal(null)}
          actions={
            <>
              <button className="btn ghost" onClick={() => navigate(`/draw/${projectId}`)}>
                저장 안 하고 나가기
              </button>
              <button
                className="btn"
                onClick={async () => {
                  if (await doSave(false)) navigate(`/draw/${projectId}`)
                }}
              >
                저장하고 나가기
              </button>
            </>
          }
        >
          <p className="sub">나가기 전에 그림을 저장할까요?</p>
        </Modal>
      )}

      {modal === 'done' && (
        <Modal
          title="그림을 완성했나요?"
          onClose={() => setModal(null)}
          actions={
            <>
              <button className="btn ghost" onClick={() => setModal(null)}>
                더 그리기
              </button>
              <button
                className="btn"
                onClick={async () => {
                  if (await doSave(true)) setModal(null)
                }}
              >
                완성으로 저장!
              </button>
            </>
          }
        >
          <p className="sub">완성으로 저장하면 목록에 ✅ 완성 표시가 돼요. 나중에 이어 그릴 수도 있어요.</p>
          <div className="option-row" style={{ marginTop: 12 }}>
            <button className="mini-btn" onClick={() => exportPageJpg(project, page)}>
              <span className="material-icons-outlined" aria-hidden="true">image</span>내 그림 JPG
            </button>
            <button className="mini-btn" onClick={() => exportPagePdf(project, page)}>
              <span className="material-icons-outlined" aria-hidden="true">picture_as_pdf</span>내 그림 PDF
            </button>
            <button
              className="mini-btn"
              onClick={async () => {
                if (await copyText(viewerLink(project.projectId, page.index))) {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }
              }}
            >
              <span className="material-icons-outlined" aria-hidden="true">link</span>
              {copied ? '복사됨!' : '보기 링크 복사'}
            </button>
          </div>
          <p className="sub" style={{ marginTop: 8 }}>
            보기 링크는 이 기기에서만 열 수 있어요. 부모님께 보여드릴 땐 JPG를 내려받아 보내 주세요.
          </p>
        </Modal>
      )}
    </div>
  )
}
