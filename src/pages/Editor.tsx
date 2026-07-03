import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import { loadFontForCanvas } from '../lib/fonts'
import { renderPageCanvas } from '../lib/render'
import {
  deleteUploadImage,
  getEditorState,
  getUploadImage,
  saveEditorState,
  saveUploadImage,
} from '../lib/storage'
import { loadDrawing, loadProject, sourceFromSearch } from '../lib/backend'
import { serverAuth } from '../lib/api'
import { downloadBlob, formatTime, genId } from '../lib/util'
import {
  checkMp4Support,
  drawFrame,
  exportMp4,
  exportWebm,
  makeCreditCard,
  makeTitleCard,
  type Mp4Support,
  type RenderClip,
} from '../lib/video'
import type { ClipData, EditorState, Project, TransitionData, TransitionType } from '../lib/types'

const PPS = 24 // 타임라인 픽셀/초
const SNAP = 0.5
const MIN_CLIP = 0.5
const CLIP_BITMAP_SCALE = 0.8 // 1536×1086 — 메모리와 화질 절충

const TRANSITION_TYPES: { v: TransitionType; label: string }[] = [
  { v: 'cut', label: '컷' },
  { v: 'fade', label: '페이드' },
  { v: 'dissolve', label: '디졸브' },
  { v: 'slideL', label: '슬라이드 ←' },
  { v: 'slideR', label: '슬라이드 →' },
  { v: 'zoomIn', label: '줌인' },
  { v: 'zoomOut', label: '줌아웃' },
]

const defaultTransition = (): TransitionData => ({ type: 'cut', duration: 0.6 })

function snap(v: number): number {
  return Math.round(v / SNAP) * SNAP
}

function starts(clips: ClipData[]): number[] {
  const out: number[] = []
  let acc = 0
  for (const c of clips) {
    out.push(acc)
    acc += c.duration
  }
  return out
}

/** 클립 길이 합이 음원 길이와 같아지도록 비율 조정 */
function normalize(clips: ClipData[], total: number): ClipData[] {
  if (!clips.length || !total) return clips
  const sum = clips.reduce((s, c) => s + c.duration, 0)
  if (sum <= 0) {
    const each = Math.max(MIN_CLIP, total / clips.length)
    return clips.map((c) => ({ ...c, duration: each }))
  }
  const k = total / sum
  const out = clips.map((c) => ({ ...c, duration: Math.max(MIN_CLIP, Math.round(c.duration * k * 10) / 10) }))
  const diff = total - out.reduce((s, c) => s + c.duration, 0)
  out[out.length - 1] = {
    ...out[out.length - 1],
    duration: Math.max(MIN_CLIP, out[out.length - 1].duration + diff),
  }
  return out
}

export default function Editor() {
  const { projectId } = useParams()
  const [params] = useSearchParams()
  const source = sourceFromSearch(params)
  // 활동지 없이 바로 뮤직비디오만 만드는 독립 실행 모드 (/edit, projectId 없음)
  const standalone = !projectId
  const storageId = projectId ?? '__standalone_mv__'
  const [project, setProject] = useState<Project | null>(null)
  const [missing, setMissing] = useState(false)
  const [pinOk, setPinOk] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState(false)
  const [checkingPin, setCheckingPin] = useState(false)

  const [audioUrl, setAudioUrl] = useState('')
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null)
  const [audioName, setAudioName] = useState('')

  const [clips, setClips] = useState<ClipData[]>([])
  const [transitions, setTransitions] = useState<TransitionData[]>([])
  const [kenBurns, setKenBurns] = useState(false)
  const [intro, setIntro] = useState(false)
  const [outro, setOutro] = useState(false)
  const [className, setClassName] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [curTime, setCurTime] = useState(0)
  const [tapSync, setTapSync] = useState(false)
  const [tapIndex, setTapIndex] = useState(0)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [resolution, setResolution] = useState<'1080' | '720'>('1080')
  const [mp4Support, setMp4Support] = useState<Mp4Support | 'unknown'>('unknown')
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState({ ratio: 0, label: '' })
  const [stateLoaded, setStateLoaded] = useState(false)

  const audioRef = useRef<HTMLAudioElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const waveRef = useRef<HTMLCanvasElement>(null)
  const bitmapsRef = useRef(new Map<string, ImageBitmap>())
  const exportSignal = useRef<{ cancelled: boolean }>({ cancelled: false })
  const dragRef = useRef<{ index: number; startX: number; startDur: number; nextDur: number } | null>(null)

  const duration = audioBuffer?.duration ?? 0

  // ---------- 로드 ----------
  useEffect(() => {
    if (standalone) {
      // 활동지 없이 시작: 빈 프로젝트(제목만 편집)로 바로 진입, PIN 불필요
      setProject({
        projectId: storageId,
        pin: '',
        title: '',
        createdAt: new Date().toISOString(),
        studentCount: 0,
        font: 'Jua',
        fontSize: 'md',
        lyricPosition: 'bottom',
        requireName: false,
        pages: [],
      })
      setPinOk(true)
      return
    }
    loadProject(source, projectId!).then((p) => {
      if (!p) {
        setMissing(true)
        return
      }
      setProject(p)
      // 로컬은 PIN을 알고 있으므로 즉시 비교, 서버는 auth 호출로 확인
      if (source === 'local' && sessionStorage.getItem(`easymv_pin_${projectId}`) === p.pin) setPinOk(true)
      if (source === 'server' && sessionStorage.getItem(`easymv_pin_${projectId}`) === '1') setPinOk(true)
    })
  }, [projectId, source, standalone, storageId])

  useEffect(() => {
    checkMp4Support().then(setMp4Support)
  }, [])

  useEffect(() => {
    if (!pinOk) return
    getEditorState(storageId).then((s) => {
      if (s) {
        setClips(s.clips)
        setTransitions(s.transitions)
        setKenBurns(s.kenBurns)
        setIntro(s.intro)
        setOutro(s.outro)
        setClassName(s.className)
      }
      setStateLoaded(true)
    })
  }, [storageId, pinOk])

  // 편집 상태 자동 저장
  useEffect(() => {
    if (!stateLoaded) return
    const t = setTimeout(() => {
      const s: EditorState = {
        projectId: storageId,
        clips,
        transitions,
        kenBurns,
        showLyricOverlay: false,
        intro,
        outro,
        className,
        updatedAt: new Date().toISOString(),
      }
      saveEditorState(s)
    }, 600)
    return () => clearTimeout(t)
  }, [storageId, stateLoaded, clips, transitions, kenBurns, intro, outro, className])

  // ---------- 클립 비트맵 준비 ----------
  const ensureBitmap = useCallback(
    async (clip: ClipData): Promise<ImageBitmap | null> => {
      const cached = bitmapsRef.current.get(clip.id)
      if (cached) return cached
      if (!project) return null
      let bmp: ImageBitmap | null = null
      if (clip.id === 'intro') {
        bmp = await makeTitleCard(project.title, className)
      } else if (clip.id === 'outro') {
        bmp = await makeCreditCard(project.pages.map((p) => p.studentName ?? ''))
      } else if (clip.pageIndex != null) {
        const page = project.pages.find((p) => p.index === clip.pageIndex)
        if (page) {
          await loadFontForCanvas(project.font, page.lyric)
          const rec = await loadDrawing(source, project.projectId, page.index)
          let drawing: ImageBitmap | null = null
          if (rec) {
            try {
              drawing = await createImageBitmap(rec.blob)
            } catch {
              drawing = null
            }
          }
          const canvas = renderPageCanvas(project, page, { scale: CLIP_BITMAP_SCALE, drawing })
          drawing?.close()
          bmp = await createImageBitmap(canvas)
        }
      } else {
        const blob = await getUploadImage(project.projectId, clip.id)
        if (blob) {
          try {
            bmp = await createImageBitmap(blob)
          } catch {
            bmp = null
          }
        }
      }
      if (bmp) bitmapsRef.current.set(clip.id, bmp)
      return bmp
    },
    [project, className, source],
  )

  // 인트로/크레딧 카드는 내용이 바뀌면 다시 그리기
  useEffect(() => {
    bitmapsRef.current.get('intro')?.close()
    bitmapsRef.current.delete('intro')
    bitmapsRef.current.get('outro')?.close()
    bitmapsRef.current.delete('outro')
  }, [className, project])

  // 썸네일 준비
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      for (const clip of clips) {
        if (thumbs[clip.id]) continue
        const bmp = await ensureBitmap(clip)
        if (cancelled || !bmp) continue
        const c = document.createElement('canvas')
        c.width = 120
        c.height = 85
        const cx = c.getContext('2d')!
        cx.fillStyle = '#fff'
        cx.fillRect(0, 0, 120, 85)
        const fit = Math.min(120 / bmp.width, 85 / bmp.height)
        cx.drawImage(bmp, (120 - bmp.width * fit) / 2, (85 - bmp.height * fit) / 2, bmp.width * fit, bmp.height * fit)
        const url = c.toDataURL('image/jpeg', 0.6)
        if (!cancelled) setThumbs((prev) => ({ ...prev, [clip.id]: url }))
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [clips, ensureBitmap, thumbs])

  // ---------- 음원 ----------
  const onAudioFile = async (file: File) => {
    setAudioName(file.name)
    const url = URL.createObjectURL(file)
    setAudioUrl(url)
    const buf = await file.arrayBuffer()
    const ctx = new AudioContext()
    try {
      const decoded = await ctx.decodeAudioData(buf)
      setAudioBuffer(decoded)
      setClips((prev) => (prev.length ? normalize(prev, decoded.duration) : prev))
    } catch {
      alert('이 음원 파일을 읽을 수 없어요. mp3, m4a, wav 파일인지 확인해 주세요.')
    } finally {
      ctx.close()
    }
  }

  // 파형 그리기
  useEffect(() => {
    const canvas = waveRef.current
    if (!canvas || !audioBuffer) return
    const w = Math.max(300, Math.round(duration * PPS))
    canvas.width = w
    canvas.height = 64
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, w, 64)
    ctx.fillStyle = '#7fb4e8'
    const data = audioBuffer.getChannelData(0)
    const step = Math.max(1, Math.floor(data.length / w))
    for (let x = 0; x < w; x++) {
      let min = 0
      let max = 0
      const base = x * step
      for (let i = 0; i < step; i += 16) {
        const v = data[base + i] ?? 0
        if (v > max) max = v
        if (v < min) min = v
      }
      const h = Math.max(1, (max - min) * 30)
      ctx.fillRect(x, 32 - h, 1, h * 2)
    }
  }, [audioBuffer, duration])

  // ---------- 이미지 소스 ----------
  const loadStudentDrawings = async () => {
    if (!project || !projectId) return
    // 서버 프로젝트는 최신 상태를 다시 받아온 뒤 그림을 모음
    let src = project
    if (source === 'server') {
      const fresh = await loadProject(source, projectId)
      if (fresh) {
        src = { ...fresh, pin: project.pin }
        setProject(src)
        bitmapsRef.current.clear()
        setThumbs({})
      }
    }
    const withDrawings: ClipData[] = []
    for (const page of src.pages) {
      const rec = await loadDrawing(source, src.projectId, page.index)
      if (!rec) continue
      withDrawings.push({
        id: `page_${page.index}`,
        pageIndex: page.index,
        label: page.lyric.split(' ')[0] || `${page.index}p`,
        duration: 3,
      })
    }
    if (withDrawings.length === 0) {
      alert(
        source === 'server'
          ? '아직 제출된 학생 그림이 없어요. 학생들이 그림을 저장하면 여기서 불러올 수 있어요.'
          : '저장된 학생 그림이 아직 없어요. 그리기 화면에서 저장한 그림이 이 브라우저에 있어야 해요.',
      )
      return
    }
    setClips((prev) => {
      const uploads = prev.filter((c) => c.pageIndex == null && c.id !== 'intro' && c.id !== 'outro')
      const introClip = prev.find((c) => c.id === 'intro')
      const outroClip = prev.find((c) => c.id === 'outro')
      let next = [...(introClip ? [introClip] : []), ...withDrawings, ...uploads, ...(outroClip ? [outroClip] : [])]
      if (duration) next = normalize(next, duration)
      setTransitions((tr) => {
        const need = next.length - 1
        return Array.from({ length: Math.max(0, need) }, (_, i) => tr[i] ?? defaultTransition())
      })
      return next
    })
  }

  const onUploadImages = async (files: FileList) => {
    if (!project) return
    const newClips: ClipData[] = []
    for (const file of Array.from(files)) {
      const id = `up_${genId()}`
      await saveUploadImage(project.projectId, id, file)
      newClips.push({ id, pageIndex: null, label: file.name.replace(/\.[^.]+$/, ''), duration: 3 })
    }
    setClips((prev) => {
      const outroIdx = prev.findIndex((c) => c.id === 'outro')
      const next = [...prev]
      if (outroIdx >= 0) next.splice(outroIdx, 0, ...newClips)
      else next.push(...newClips)
      const normalized = duration ? normalize(next, duration) : next
      setTransitions((tr) => {
        const need = normalized.length - 1
        return Array.from({ length: Math.max(0, need) }, (_, i) => tr[i] ?? defaultTransition())
      })
      return normalized
    })
  }

  // 인트로/아웃트로 토글
  useEffect(() => {
    if (!stateLoaded) return
    setClips((prev) => {
      let next = [...prev]
      const hasIntro = next.some((c) => c.id === 'intro')
      if (intro && !hasIntro) next.unshift({ id: 'intro', pageIndex: null, label: '제목', duration: 3 })
      if (!intro && hasIntro) next = next.filter((c) => c.id !== 'intro')
      const hasOutro = next.some((c) => c.id === 'outro')
      if (outro && !hasOutro) next.push({ id: 'outro', pageIndex: null, label: '크레딧', duration: 5 })
      if (!outro && hasOutro) next = next.filter((c) => c.id !== 'outro')
      if (next.length !== prev.length && duration) next = normalize(next, duration)
      setTransitions((tr) => {
        const need = next.length - 1
        return Array.from({ length: Math.max(0, need) }, (_, i) => tr[i] ?? defaultTransition())
      })
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intro, outro, stateLoaded])

  // ---------- 타임라인 편집 ----------
  const clipStarts = useMemo(() => starts(clips), [clips])

  const setBoundary = useCallback(
    (index: number, time: number) => {
      setClips((prev) => {
        const st = starts(prev)
        const min = st[index] + MIN_CLIP
        const max = st[index + 1] + prev[index + 1].duration - MIN_CLIP
        const b = Math.max(min, Math.min(max, snap(time)))
        const next = [...prev]
        next[index] = { ...next[index], duration: Math.round((b - st[index]) * 10) / 10 }
        next[index + 1] = {
          ...next[index + 1],
          duration: Math.round((st[index + 1] + prev[index + 1].duration - b) * 10) / 10,
        }
        return next
      })
    },
    [],
  )

  const onHandleDown = (e: React.PointerEvent, index: number) => {
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { index, startX: e.clientX, startDur: clips[index].duration, nextDur: clips[index + 1].duration }
  }
  const onHandleMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const dt = (e.clientX - d.startX) / PPS
    setBoundary(d.index, clipStarts[d.index] + d.startDur + dt)
  }
  const onHandleUp = () => {
    dragRef.current = null
  }

  const evenDistribute = () => {
    if (!duration || !clips.length) return
    const each = duration / clips.length
    setClips((prev) => normalize(prev.map((c) => ({ ...c, duration: each })), duration))
  }

  const moveClip = (id: string, dir: -1 | 1) => {
    setClips((prev) => {
      const i = prev.findIndex((c) => c.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  /** 썸네일을 드래그해서 다른 클립 위에 놓으면 그 자리로 순서 이동 */
  const reorderClip = (draggedId: string, dropOnId: string) => {
    if (draggedId === dropOnId) return
    setClips((prev) => {
      const from = prev.findIndex((c) => c.id === draggedId)
      const to = prev.findIndex((c) => c.id === dropOnId)
      if (from < 0 || to < 0) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  const removeClip = (id: string) => {
    setClips((prev) => {
      const next = prev.filter((c) => c.id !== id)
      setTransitions((tr) => tr.slice(0, Math.max(0, next.length - 1)))
      return duration && next.length ? normalize(next, duration) : next
    })
    if (id.startsWith('up_') && project) deleteUploadImage(project.projectId, id)
    if (id === 'intro') setIntro(false)
    if (id === 'outro') setOutro(false)
    bitmapsRef.current.get(id)?.close()
    bitmapsRef.current.delete(id)
    setSelected(null)
  }

  // ---------- 탭 싱크 ----------
  const startTapSync = () => {
    const audio = audioRef.current
    if (!audio || clips.length < 2) return
    audio.currentTime = 0
    audio.play()
    setPlaying(true)
    setTapSync(true)
    setTapIndex(1)
  }

  const doTap = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !tapSync) return
    const t = audio.currentTime
    setTapIndex((idx) => {
      if (idx >= clips.length) return idx
      // idx번째 클립의 시작 = t 가 되도록 이전 클립 길이 조정
      setClips((prev) => {
        const st = starts(prev)
        const next = [...prev]
        const newDur = Math.max(MIN_CLIP, t - st[idx - 1])
        next[idx - 1] = { ...next[idx - 1], duration: Math.round(newDur * 10) / 10 }
        // 뒤 클립들은 남은 시간에 비례 배분
        const remaining = duration - (st[idx - 1] + newDur)
        const tail = next.slice(idx)
        const tailSum = tail.reduce((s, c) => s + c.duration, 0)
        if (remaining > 0 && tailSum > 0) {
          for (let k = idx; k < next.length; k++) {
            next[k] = {
              ...next[k],
              duration: Math.max(MIN_CLIP, Math.round(((next[k].duration / tailSum) * remaining) * 10) / 10),
            }
          }
        }
        return next
      })
      const nextIdx = idx + 1
      if (nextIdx >= clips.length) {
        setTapSync(false)
      }
      return nextIdx
    })
  }, [tapSync, clips.length, duration])

  useEffect(() => {
    if (!tapSync) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        doTap()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tapSync, doTap])

  // ---------- 미리보기 ----------
  const renderClipsForPreview = useCallback(async (): Promise<RenderClip[]> => {
    const st = starts(clips)
    const out: RenderClip[] = []
    for (let i = 0; i < clips.length; i++) {
      const bmp = await ensureBitmap(clips[i])
      if (bmp) out.push({ bitmap: bmp, start: st[i], duration: clips[i].duration })
    }
    return out
  }, [clips, ensureBitmap])

  useEffect(() => {
    let raf = 0
    let cancelled = false
    let rcs: RenderClip[] = []
    renderClipsForPreview().then((r) => {
      rcs = r
    })
    const loop = () => {
      if (cancelled) return
      const canvas = previewRef.current
      const audio = audioRef.current
      if (canvas && rcs.length) {
        const ctx = canvas.getContext('2d')!
        const t = audio ? audio.currentTime : 0
        drawFrame(ctx, t, rcs, transitions, canvas.width, canvas.height, kenBurns)
        setCurTime(t)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [renderClipsForPreview, transitions, kenBurns])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      audio.play()
      setPlaying(true)
    } else {
      audio.pause()
      setPlaying(false)
    }
  }

  const seek = (t: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = Math.max(0, Math.min(duration, t))
  }

  // ---------- 내보내기 ----------
  const doExport = async () => {
    if (!audioBuffer || !project || clips.length === 0) return
    setExporting(true)
    exportSignal.current = { cancelled: false }
    setExportProgress({ ratio: 0, label: '준비 중…' })
    try {
      const rcs = await renderClipsForPreview()
      const height = resolution === '1080' ? 1080 : 720
      const width = resolution === '1080' ? 1920 : 1280
      const opts = {
        clips: rcs,
        transitions,
        audioBuffer,
        width,
        height,
        fps: 30,
        kenBurns,
        onProgress: (ratio: number, label: string) => setExportProgress({ ratio, label }),
        signal: exportSignal.current,
      }
      const useMp4 = mp4Support !== null && mp4Support !== 'unknown'
      const blob = useMp4
        ? await exportMp4({ ...opts, audioCodec: (mp4Support as { audio: 'aac' | 'opus' }).audio })
        : await exportWebm(opts)
      downloadBlob(blob, `${project.title || 'easymv'}_뮤직비디오.${useMp4 ? 'mp4' : 'webm'}`)
      setExportProgress({ ratio: 1, label: '완성!' })
    } catch (e) {
      if ((e as Error).message !== 'cancelled') {
        setExportProgress({ ratio: 0, label: '내보내기에 실패했어요. 다시 시도해 주세요.' })
      }
    } finally {
      setExporting(false)
    }
  }

  // ---------- 렌더 ----------
  if (missing) {
    return (
      <Layout theme="edit">
        <div className="card">
          <h1>프로젝트를 찾을 수 없어요</h1>
          <p className="sub">뮤직비디오 편집은 활동지를 만든 브라우저(또는 복제한 브라우저)에서 열 수 있어요.</p>
        </div>
      </Layout>
    )
  }
  if (!project) {
    return (
      <Layout theme="edit">
        <p className="sub">불러오는 중…</p>
      </Layout>
    )
  }

  const submitPin = async () => {
    if (!projectId || !project) return
    setCheckingPin(true)
    setPinError(false)
    try {
      const ok = source === 'server' ? await serverAuth(projectId, pinInput) : pinInput === project.pin
      if (ok) {
        sessionStorage.setItem(`easymv_pin_${projectId}`, source === 'server' ? '1' : project.pin)
        // 서버 프로젝트는 인증 후 PIN을 프로젝트에 채워 편집/삭제 요청에 사용
        if (source === 'server') setProject((prev) => (prev ? { ...prev, pin: pinInput } : prev))
        setPinOk(true)
      } else setPinError(true)
    } finally {
      setCheckingPin(false)
    }
  }

  if (!pinOk) {
    return (
      <Layout theme="edit">
        <div className="card" style={{ maxWidth: 420, margin: '40px auto' }}>
          <h1>관리 코드 입력</h1>
          <p className="sub">활동지를 만들 때 발급된 4자리 관리 코드(PIN)를 입력하세요.</p>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pinInput}
            onChange={(e) => {
              setPinInput(e.target.value)
              setPinError(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitPin()
            }}
            aria-label="관리 코드"
            style={{ fontSize: '1.4rem', letterSpacing: 8, textAlign: 'center' }}
          />
          {pinError && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>코드가 맞지 않아요.</p>}
          <div style={{ marginTop: 12 }}>
            <button className="btn" style={{ width: '100%' }} disabled={checkingPin} onClick={submitPin}>
              {checkingPin ? '확인 중…' : '들어가기'}
            </button>
          </div>
        </div>
      </Layout>
    )
  }

  const selectedIndex = clips.findIndex((c) => c.id === selected)
  const selectedClip = selectedIndex >= 0 ? clips[selectedIndex] : null
  // 음원이 없어도 클립 길이 합만큼은 타임라인 폭을 확보해 썸네일이 보이게 함
  const clipsDuration = clips.reduce((s, c) => s + c.duration, 0)
  const timelineW = Math.max(300, Math.round((duration || clipsDuration) * PPS))

  return (
    <Layout theme="edit" wide>
      <h1>뮤직비디오 만들기{project.title ? ` — ${project.title}` : ''}</h1>
      <div className="editor-layout">
        <div className="editor-top">
          {/* 미리보기 */}
          <div>
            <div className="player-box">
              <canvas ref={previewRef} width={960} height={540} />
            </div>
            <div className="player-controls" style={{ marginTop: 8 }}>
              <button className="btn" onClick={togglePlay} disabled={!audioUrl} aria-label={playing ? '일시정지' : '재생'}>
                <span className="material-icons-outlined" aria-hidden="true">
                  {playing ? 'pause' : 'play_arrow'}
                </span>
                {playing ? '일시정지' : '재생'}
              </button>
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {formatTime(curTime)} / {formatTime(duration)}
              </span>
              <audio
                ref={audioRef}
                src={audioUrl}
                onEnded={() => setPlaying(false)}
                onPause={() => setPlaying(false)}
                onPlay={() => setPlaying(true)}
              />
            </div>
          </div>

          {/* 설정 패널 */}
          <div className="editor-panel">
            <div className="card form-stack" style={{ padding: 16 }}>
              <h2 style={{ margin: 0 }}>소스 불러오기</h2>
              <label className="btn secondary" style={{ cursor: 'pointer' }}>
                <span className="material-icons-outlined" aria-hidden="true">
                  music_note
                </span>
                {audioName || '음원 업로드 (mp3/m4a/wav)'}
                <input
                  type="file"
                  accept="audio/*,.mp3,.m4a,.wav"
                  className="sr-only"
                  onChange={(e) => e.target.files?.[0] && onAudioFile(e.target.files[0])}
                />
              </label>
              {!standalone && (
                <button className="btn secondary" onClick={loadStudentDrawings}>
                  <span className="material-icons-outlined" aria-hidden="true">
                    collections
                  </span>
                  학생 그림 자동 불러오기
                </button>
              )}
              <label className="btn ghost" style={{ cursor: 'pointer' }}>
                <span className="material-icons-outlined" aria-hidden="true">
                  add_photo_alternate
                </span>
                {standalone ? '사진·그림 추가 (JPG/PNG)' : '이미지 추가 (JPG/PNG)'}
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  multiple
                  className="sr-only"
                  onChange={(e) => e.target.files && onUploadImages(e.target.files)}
                />
              </label>
              <p className="sub" style={{ margin: 0 }}>
                음원은 서버에 올라가지 않고 이 브라우저 안에서만 사용돼요. (저작권 보호)
              </p>
            </div>

            <div className="card form-stack" style={{ padding: 16 }}>
              <h2 style={{ margin: 0 }}>옵션</h2>
              {standalone && (
                <div>
                  <label className="field" htmlFor="mvtitle">
                    영상 제목 (제목 카드에 표시)
                  </label>
                  <input
                    id="mvtitle"
                    type="text"
                    placeholder="예: 우리 반 봄 노래"
                    value={project.title}
                    onChange={(e) => setProject((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
                  />
                </div>
              )}
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44, cursor: 'pointer' }}>
                <input type="checkbox" style={{ width: 20, height: 20 }} checked={kenBurns} onChange={(e) => setKenBurns(e.target.checked)} />
                Ken Burns 효과 (천천히 줌·이동)
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44, cursor: 'pointer' }}>
                <input type="checkbox" style={{ width: 20, height: 20 }} checked={intro} onChange={(e) => setIntro(e.target.checked)} />
                인트로 제목 카드
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44, cursor: 'pointer' }}>
                <input type="checkbox" style={{ width: 20, height: 20 }} checked={outro} onChange={(e) => setOutro(e.target.checked)} />
                {standalone ? '엔딩 카드' : '크레딧 카드 (참여 학생 이름)'}
              </label>
              <div>
                <label className="field" htmlFor="clsname">
                  {standalone ? '부제 (제목 카드에 작게 표시)' : '학급명 (제목 카드에 표시)'}
                </label>
                <input id="clsname" type="text" placeholder={standalone ? '예: 3학년 2반' : '예: 3학년 2반'} value={className} onChange={(e) => setClassName(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        {/* 탭 싱크 */}
        <div className="card" style={{ padding: 16 }}>
          <div className="option-row" style={{ alignItems: 'center' }}>
            {!tapSync ? (
              <button className="btn big" onClick={startTapSync} disabled={!audioUrl || clips.length < 2}>
                <span className="material-icons-outlined" aria-hidden="true">
                  touch_app
                </span>
                탭 싱크 시작
              </button>
            ) : (
              <button className="btn big tapsync-btn" style={{ background: 'var(--danger)' }} onClick={doTap}>
                👆 탭! — 다음 장면 ({Math.min(tapIndex + 1, clips.length)}/{clips.length})
              </button>
            )}
            {tapSync && (
              <button
                className="btn ghost"
                onClick={() => {
                  setTapSync(false)
                  audioRef.current?.pause()
                }}
              >
                그만하기
              </button>
            )}
            <button className="btn ghost" onClick={evenDistribute} disabled={!duration || !clips.length}>
              <span className="material-icons-outlined" aria-hidden="true">
                view_column
              </span>
              균등 분배
            </button>
            <span className="sub">
              음악을 들으며 가사가 바뀔 때마다 버튼(또는 스페이스바)을 누르면 타이밍이 자동으로 기록돼요.
            </span>
          </div>
        </div>

        {/* 타임라인 */}
        <div className="timeline">
          {clips.length === 0 ? (
            <p className="sub" style={{ margin: 8 }}>
              사진·그림을 추가하면 여기에 순서대로 나타나요. 썸네일을 드래그하면 순서를 바꿀 수 있어요.
            </p>
          ) : (
            <>
              <div className="timeline-inner" style={{ width: timelineW }}>
                {audioBuffer && (
                  <div
                    className="wave-track"
                    style={{ width: timelineW }}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      seek((e.clientX - rect.left) / PPS)
                    }}
                  >
                    <canvas ref={waveRef} />
                    <div className="playhead" style={{ left: curTime * PPS }} />
                  </div>
                )}
                <div className="clip-track" style={{ width: timelineW }}>
                  {clips.map((clip, i) => (
                    <div
                      key={clip.id}
                      className={`clip ${selected === clip.id ? 'selected' : ''} ${draggingId === clip.id ? 'dragging' : ''}`}
                      style={{ left: clipStarts[i] * PPS, width: Math.max(20, clip.duration * PPS) }}
                    >
                      <div
                        className="clip-body"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', clip.id)
                          e.dataTransfer.effectAllowed = 'move'
                          setDraggingId(clip.id)
                        }}
                        onDragEnd={() => setDraggingId(null)}
                        onDragOver={(e) => {
                          e.preventDefault()
                          e.dataTransfer.dropEffect = 'move'
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          const draggedId = e.dataTransfer.getData('text/plain')
                          if (draggedId) reorderClip(draggedId, clip.id)
                          setDraggingId(null)
                        }}
                        onClick={() => setSelected(clip.id)}
                        role="button"
                        tabIndex={0}
                        aria-label={`${i + 1}번째 장면: ${clip.label}. 드래그해서 순서 변경`}
                        onKeyDown={(e) => e.key === 'Enter' && setSelected(clip.id)}
                      >
                        {thumbs[clip.id] && <img src={thumbs[clip.id]} alt="" draggable={false} />}
                        <div>
                          <div className="clip-label">{clip.label}</div>
                          <div>{clip.duration.toFixed(1)}초</div>
                        </div>
                      </div>
                      {i < clips.length - 1 && (
                        <div
                          className="clip-handle"
                          onPointerDown={(e) => onHandleDown(e, i)}
                          onPointerMove={onHandleMove}
                          onPointerUp={onHandleUp}
                          aria-label={`${i + 1}번과 ${i + 2}번 장면 경계 조절`}
                          role="slider"
                          aria-valuenow={Math.round((clipStarts[i] + clip.duration) * 10) / 10}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowLeft') setBoundary(i, clipStarts[i] + clip.duration - SNAP)
                            if (e.key === 'ArrowRight') setBoundary(i, clipStarts[i] + clip.duration + SNAP)
                          }}
                        />
                      )}
                    </div>
                  ))}
                  {audioBuffer && <div className="playhead" style={{ left: curTime * PPS }} />}
                </div>
              </div>
              {!audioBuffer && (
                <p className="sub" style={{ margin: '8px 0 0' }}>
                  음원을 올리면 노래 길이에 맞춰 자동으로 길이가 조절돼요. 지금은 각 장면이 3초씩이에요.
                </p>
              )}
            </>
          )}
        </div>

        {/* 선택된 클립 편집 */}
        {selectedClip && (
          <div className="card" style={{ padding: 16 }}>
            <div className="option-row" style={{ alignItems: 'center' }}>
              <strong>
                {selectedIndex + 1}. {selectedClip.label}
              </strong>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                길이(초)
                <input
                  type="number"
                  step={0.5}
                  min={MIN_CLIP}
                  style={{ width: 90 }}
                  value={selectedClip.duration}
                  onChange={(e) => {
                    const v = Math.max(MIN_CLIP, Number(e.target.value) || MIN_CLIP)
                    if (selectedIndex < clips.length - 1) {
                      setBoundary(selectedIndex, clipStarts[selectedIndex] + v)
                    }
                  }}
                  disabled={selectedIndex === clips.length - 1}
                />
              </label>
              <button className="mini-btn" onClick={() => moveClip(selectedClip.id, -1)} disabled={selectedIndex === 0}>
                <span className="material-icons-outlined" aria-hidden="true">arrow_back</span>앞으로
              </button>
              <button
                className="mini-btn"
                onClick={() => moveClip(selectedClip.id, 1)}
                disabled={selectedIndex === clips.length - 1}
              >
                <span className="material-icons-outlined" aria-hidden="true">arrow_forward</span>뒤로
              </button>
              <button className="mini-btn" style={{ color: 'var(--danger)' }} onClick={() => removeClip(selectedClip.id)}>
                <span className="material-icons-outlined" aria-hidden="true">delete</span>삭제
              </button>
            </div>
            {selectedIndex < clips.length - 1 && transitions[selectedIndex] && (
              <div className="option-row" style={{ alignItems: 'center', marginTop: 12 }}>
                <span className="field" style={{ margin: 0 }}>
                  다음 장면 전환:
                </span>
                <select
                  style={{ width: 'auto' }}
                  value={transitions[selectedIndex].type}
                  onChange={(e) =>
                    setTransitions((tr) =>
                      tr.map((t, i) => (i === selectedIndex ? { ...t, type: e.target.value as TransitionType } : t)),
                    )
                  }
                >
                  {TRANSITION_TYPES.map((t) => (
                    <option key={t.v} value={t.v}>
                      {t.label}
                    </option>
                  ))}
                </select>
                {transitions[selectedIndex].type !== 'cut' && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    전환 길이
                    <input
                      type="range"
                      min={0.3}
                      max={1.5}
                      step={0.1}
                      value={transitions[selectedIndex].duration}
                      onChange={(e) =>
                        setTransitions((tr) =>
                          tr.map((t, i) => (i === selectedIndex ? { ...t, duration: Number(e.target.value) } : t)),
                        )
                      }
                    />
                    {transitions[selectedIndex].duration.toFixed(1)}초
                  </label>
                )}
                <button
                  className="mini-btn"
                  onClick={() => {
                    const cur = transitions[selectedIndex]
                    setTransitions((tr) => tr.map(() => ({ ...cur })))
                  }}
                >
                  모든 전환에 일괄 적용
                </button>
              </div>
            )}
          </div>
        )}

        {/* 내보내기 */}
        <div className="card form-stack" style={{ padding: 16 }}>
          <h2 style={{ margin: 0 }}>내보내기</h2>
          <div className="option-row" style={{ alignItems: 'center' }}>
            <div className="seg" role="group" aria-label="해상도">
              <button className={resolution === '1080' ? 'on' : ''} onClick={() => setResolution('1080')}>
                1080p
              </button>
              <button className={resolution === '720' ? 'on' : ''} onClick={() => setResolution('720')}>
                720p
              </button>
            </div>
            <button className="btn big" onClick={doExport} disabled={exporting || !audioBuffer || clips.length === 0}>
              <span className="material-icons-outlined" aria-hidden="true">
                movie
              </span>
              {mp4Support === null ? '영상 만들기 (webm)' : '영상 만들기 (MP4)'}
            </button>
            {exporting && (
              <button
                className="btn ghost"
                onClick={() => {
                  exportSignal.current.cancelled = true
                }}
              >
                취소
              </button>
            )}
          </div>
          {(exporting || exportProgress.label) && (
            <div>
              <div className="progress-bar" aria-hidden="true">
                <div style={{ width: `${Math.round(exportProgress.ratio * 100)}%` }} />
              </div>
              <p className="sub" aria-live="polite">
                {exportProgress.label} {exporting && `${Math.round(exportProgress.ratio * 100)}%`}
              </p>
            </div>
          )}
          {mp4Support === null && (
            <p className="sub">이 브라우저는 MP4 저장을 지원하지 않아 webm 형식으로 저장돼요. (크롬/엣지 추천)</p>
          )}
          <p className="sub" style={{ margin: 0 }}>
            렌더링은 모두 브라우저 안에서 처리돼요. 음원 파일은 어디에도 업로드되지 않아요. 편집 상태(타이밍·전환)는
            자동 저장되지만, 음원은 다시 방문하면 한 번 더 업로드해야 해요.
          </p>
        </div>
      </div>
    </Layout>
  )
}
