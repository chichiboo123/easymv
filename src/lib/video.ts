import { ArrayBufferTarget, Muxer } from 'mp4-muxer'
import type { TransitionData } from './types'

export interface RenderClip {
  bitmap: ImageBitmap
  start: number
  duration: number
}

// ---------- 프레임 합성 ----------

function drawFitted(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  img: ImageBitmap,
  W: number,
  H: number,
  zoom: number,
  panX: number,
  panY: number,
  alpha: number,
  offsetX = 0,
  scaleOverride = 1,
) {
  const fit = Math.min(W / img.width, H / img.height) * zoom * scaleOverride
  const dw = img.width * fit
  const dh = img.height * fit
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.drawImage(img, (W - dw) / 2 + panX + offsetX, (H - dh) / 2 + panY, dw, dh)
  ctx.restore()
}

function drawClip(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  clip: RenderClip,
  index: number,
  t: number,
  W: number,
  H: number,
  kenBurns: boolean,
  alpha = 1,
  offsetX = 0,
  scaleOverride = 1,
) {
  let zoom = 1
  let panX = 0
  let panY = 0
  if (kenBurns && clip.duration > 0) {
    const p = Math.max(0, Math.min(1, (t - clip.start) / clip.duration))
    const dir = index % 4
    if (dir === 0) {
      zoom = 1 + 0.07 * p
      panX = -W * 0.015 * p
    } else if (dir === 1) {
      zoom = 1.07 - 0.07 * p
      panX = W * 0.015 * p
    } else if (dir === 2) {
      zoom = 1 + 0.07 * p
      panY = -H * 0.015 * p
    } else {
      zoom = 1.07 - 0.07 * p
      panY = H * 0.015 * p
    }
  }
  drawFitted(ctx, clip.bitmap, W, H, zoom, panX, panY, alpha, offsetX, scaleOverride)
}

/** 시각 t의 프레임 하나를 캔버스에 그림 (미리보기·내보내기 공용) */
export function drawFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  t: number,
  clips: RenderClip[],
  transitions: TransitionData[],
  W: number,
  H: number,
  kenBurns: boolean,
): void {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  if (clips.length === 0) return

  let i = clips.length - 1
  for (let k = 0; k < clips.length; k++) {
    if (t < clips[k].start + clips[k].duration) {
      i = k
      break
    }
  }
  const cur = clips[i]
  const next = clips[i + 1]
  const trans = transitions[i]
  const boundary = cur.start + cur.duration
  const td = next && trans && trans.type !== 'cut' ? Math.min(trans.duration, cur.duration) : 0
  const inTransition = td > 0 && t >= boundary - td

  if (!inTransition || !next) {
    drawClip(ctx, cur, i, t, W, H, kenBurns)
    return
  }

  const p = Math.min(1, (t - (boundary - td)) / td)
  const type = trans.type
  if (type === 'fade') {
    // 흰색을 거쳐 다음 장면으로
    if (p < 0.5) {
      drawClip(ctx, cur, i, t, W, H, kenBurns, 1 - p * 2)
    } else {
      drawClip(ctx, next, i + 1, next.start, W, H, kenBurns, (p - 0.5) * 2)
    }
  } else if (type === 'dissolve') {
    drawClip(ctx, cur, i, t, W, H, kenBurns)
    drawClip(ctx, next, i + 1, next.start, W, H, kenBurns, p)
  } else if (type === 'slideL' || type === 'slideR') {
    drawClip(ctx, cur, i, t, W, H, kenBurns)
    const dir = type === 'slideL' ? 1 : -1
    const ease = 1 - Math.pow(1 - p, 3)
    drawClip(ctx, next, i + 1, next.start, W, H, kenBurns, 1, dir * W * (1 - ease))
  } else if (type === 'zoomIn') {
    drawClip(ctx, cur, i, t, W, H, kenBurns)
    drawClip(ctx, next, i + 1, next.start, W, H, kenBurns, p, 0, 0.7 + 0.3 * p)
  } else {
    // zoomOut: 현재 장면이 커지며 사라짐
    drawClip(ctx, next, i + 1, next.start, W, H, kenBurns, p)
    drawClip(ctx, cur, i, t, W, H, kenBurns, 1 - p, 0, 1 + 0.3 * p)
  }
}

// ---------- 카드(인트로/크레딧) 이미지 생성 ----------

export function makeTitleCard(title: string, className: string): Promise<ImageBitmap> {
  const c = document.createElement('canvas')
  c.width = 1920
  c.height = 1080
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 1920, 1080)
  const grad = ctx.createLinearGradient(0, 0, 0, 1080)
  grad.addColorStop(0, '#e8f3ff')
  grad.addColorStop(1, '#ffffff')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 1920, 1080)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#006dd2'
  ctx.font = `700 ${title.length > 12 ? 96 : 128}px 'Pretendard Variable', Pretendard, sans-serif`
  ctx.fillText(title || '우리 반 뮤직비디오', 960, 480)
  if (className) {
    ctx.fillStyle = '#555555'
    ctx.font = `52px 'Pretendard Variable', Pretendard, sans-serif`
    ctx.fillText(className, 960, 640)
  }
  return createImageBitmap(c)
}

export function makeCreditCard(names: string[]): Promise<ImageBitmap> {
  const c = document.createElement('canvas')
  c.width = 1920
  c.height = 1080
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 1920, 1080)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#006dd2'
  ctx.font = `700 84px 'Pretendard Variable', Pretendard, sans-serif`
  ctx.fillText('함께 만든 사람들', 960, 200)
  ctx.fillStyle = '#333333'
  ctx.font = `48px 'Pretendard Variable', Pretendard, sans-serif`
  const unique = [...new Set(names.filter(Boolean))]
  const text = unique.length ? unique.join(' · ') : '우리 반 친구들'
  // 긴 목록은 여러 줄로
  const lines: string[] = []
  let cur = ''
  for (const part of text.split(' · ')) {
    const t = cur ? cur + ' · ' + part : part
    if (ctx.measureText(t).width > 1600 && cur) {
      lines.push(cur)
      cur = part
    } else cur = t
  }
  if (cur) lines.push(cur)
  lines.forEach((l, i) => ctx.fillText(l, 960, 400 + i * 80))
  ctx.fillStyle = '#999999'
  ctx.font = `36px 'Pretendard Variable', Pretendard, sans-serif`
  ctx.fillText('여기 있어 뮤직비디오 · 교육뮤지컬 꿈꾸는 치수쌤', 960, 960)
  return createImageBitmap(c)
}

// ---------- 내보내기 ----------

export interface ExportOptions {
  clips: RenderClip[]
  transitions: TransitionData[]
  audioBuffer: AudioBuffer
  width: number
  height: number
  fps: number
  kenBurns: boolean
  audioCodec?: 'aac' | 'opus'
  onProgress: (ratio: number, label: string) => void
  signal?: { cancelled: boolean }
}

export type Mp4Support = { audio: 'aac' | 'opus' } | null

/** WebCodecs로 MP4를 만들 수 있는지, 오디오는 어떤 코덱을 쓸 수 있는지 확인 */
export async function checkMp4Support(): Promise<Mp4Support> {
  if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') return null
  try {
    const v = await VideoEncoder.isConfigSupported({
      codec: 'avc1.42002A',
      width: 1920,
      height: 1080,
      bitrate: 8_000_000,
      framerate: 30,
    })
    if (!v.supported) return null
    const aac = await AudioEncoder.isConfigSupported({
      codec: 'mp4a.40.2',
      sampleRate: 44100,
      numberOfChannels: 2,
      bitrate: 128_000,
    })
    if (aac.supported) return { audio: 'aac' }
    // 오픈소스 Chromium 등 AAC 인코더가 없는 환경은 Opus로 대체
    const opus = await AudioEncoder.isConfigSupported({
      codec: 'opus',
      sampleRate: 48000,
      numberOfChannels: 2,
      bitrate: 128_000,
    })
    if (opus.supported) return { audio: 'opus' }
    return null
  } catch {
    return null
  }
}

/** Opus 인코딩은 48kHz가 필요하므로 필요 시 리샘플링 */
async function resampleTo48k(buffer: AudioBuffer): Promise<AudioBuffer> {
  if (buffer.sampleRate === 48000) return buffer
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, Math.ceil(buffer.duration * 48000), 48000)
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.connect(ctx.destination)
  src.start()
  return ctx.startRendering()
}

/** WebCodecs + mp4-muxer로 MP4 생성 (오디오 포함, 서버 업로드 없음) */
export async function exportMp4(opts: ExportOptions): Promise<Blob> {
  const { clips, transitions, width, height, fps, kenBurns, onProgress, signal } = opts
  const audioCodec = opts.audioCodec ?? 'aac'
  const audioBuffer = audioCodec === 'opus' ? await resampleTo48k(opts.audioBuffer) : opts.audioBuffer
  const duration = audioBuffer.duration
  const totalFrames = Math.ceil(duration * fps)

  const sampleRate = audioBuffer.sampleRate
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height, frameRate: fps },
    audio: { codec: audioCodec === 'aac' ? 'aac' : 'opus', sampleRate, numberOfChannels: 2 },
    fastStart: 'in-memory',
  })

  let encodeError: unknown = null
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encodeError = e
    },
  })
  videoEncoder.configure({
    codec: 'avc1.42002A',
    width,
    height,
    bitrate: width >= 1920 ? 10_000_000 : 6_000_000,
    framerate: fps,
  })

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => {
      encodeError = e
    },
  })
  audioEncoder.configure({
    codec: audioCodec === 'aac' ? 'mp4a.40.2' : 'opus',
    sampleRate,
    numberOfChannels: 2,
    bitrate: 128_000,
  })

  // ---- 오디오 인코딩 ----
  onProgress(0, '소리 준비 중…')
  const chL = audioBuffer.getChannelData(0)
  const chR = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : chL
  const CHUNK = sampleRate // 1초 단위
  for (let off = 0; off < chL.length; off += CHUNK) {
    const len = Math.min(CHUNK, chL.length - off)
    const interleaved = new Float32Array(len * 2)
    for (let i = 0; i < len; i++) {
      interleaved[i * 2] = chL[off + i]
      interleaved[i * 2 + 1] = chR[off + i]
    }
    const ad = new AudioData({
      format: 'f32',
      sampleRate,
      numberOfFrames: len,
      numberOfChannels: 2,
      timestamp: Math.round((off / sampleRate) * 1_000_000),
      data: interleaved,
    })
    audioEncoder.encode(ad)
    ad.close()
  }

  // ---- 비디오 프레임 렌더링 ----
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')!
  for (let n = 0; n < totalFrames; n++) {
    if (signal?.cancelled) {
      videoEncoder.close()
      audioEncoder.close()
      throw new Error('cancelled')
    }
    if (encodeError) throw encodeError
    const t = n / fps
    drawFrame(ctx, t, clips, transitions, width, height, kenBurns)
    const frame = new VideoFrame(canvas, {
      timestamp: Math.round(t * 1_000_000),
      duration: Math.round(1_000_000 / fps),
    })
    videoEncoder.encode(frame, { keyFrame: n % (fps * 2) === 0 })
    frame.close()
    if (videoEncoder.encodeQueueSize > 8) {
      await new Promise((r) => setTimeout(r, 0))
      while (videoEncoder.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 10))
    }
    if (n % 10 === 0) {
      onProgress(n / totalFrames, '영상 만드는 중…')
      await new Promise((r) => setTimeout(r, 0))
    }
  }

  onProgress(0.98, '마무리 중…')
  await videoEncoder.flush()
  await audioEncoder.flush()
  if (encodeError) throw encodeError
  muxer.finalize()
  const { buffer } = muxer.target as ArrayBufferTarget
  return new Blob([buffer], { type: 'video/mp4' })
}

/** WebCodecs 미지원 브라우저용: MediaRecorder로 실시간 webm 녹화 */
export async function exportWebm(opts: ExportOptions): Promise<Blob> {
  const { clips, transitions, audioBuffer, width, height, fps, kenBurns, onProgress, signal } = opts
  const duration = audioBuffer.duration

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  drawFrame(ctx, 0, clips, transitions, width, height, kenBurns)

  const audioCtx = new AudioContext()
  const dest = audioCtx.createMediaStreamDestination()
  const src = audioCtx.createBufferSource()
  src.buffer = audioBuffer
  src.connect(dest)

  const stream = canvas.captureStream(fps)
  for (const track of dest.stream.getAudioTracks()) stream.addTrack(track)

  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : 'video/webm'
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 })
  const parts: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size) parts.push(e.data)
  }

  return new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      audioCtx.close()
      resolve(new Blob(parts, { type: 'video/webm' }))
    }
    recorder.onerror = () => reject(new Error('녹화에 실패했어요.'))
    recorder.start(500)
    const startAt = audioCtx.currentTime
    src.start()

    const tick = () => {
      const t = audioCtx.currentTime - startAt
      if (signal?.cancelled) {
        recorder.stop()
        src.stop()
        reject(new Error('cancelled'))
        return
      }
      if (t >= duration) {
        recorder.stop()
        return
      }
      drawFrame(ctx, t, clips, transitions, width, height, kenBurns)
      onProgress(Math.min(1, t / duration), '영상 녹화 중… (실시간)')
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}
