import { PAGE_H, PAGE_W } from './render'

export type Tool = 'pencil' | 'brush' | 'eraser' | 'fill'

export interface StrokeOp {
  type: 'stroke'
  tool: 'pencil' | 'brush' | 'eraser'
  color: string
  size: number
  points: number[] // [x1,y1,x2,y2,...]
}
export interface FillOp {
  type: 'fill'
  x: number
  y: number
  color: string
}
export interface ClearOp {
  type: 'clear'
}
export type DrawOp = StrokeOp | FillOp | ClearOp

export const PALETTE = [
  '#000000', '#666666', '#ffffff', '#e53935',
  '#fb8c00', '#fdd835', '#8bc34a', '#43a047',
  '#00897b', '#4fc3f7', '#1e88e5', '#3949ab',
  '#8e24aa', '#f06292', '#8d6e63', '#ffcc80',
]

export const PENCIL_SIZES = [6, 14, 28]
export const BRUSH_SIZE = 44
export const ERASER_SIZE = 64

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * 그리기 상태를 관리하는 엔진.
 * 모든 동작을 op 목록으로 기록하고, 실행취소는 base 이미지 위에 op를 다시 그려서 처리합니다.
 * (1920×1358 ImageData 스냅숏 30장은 메모리를 너무 쓰므로 replay 방식 사용)
 */
export class DrawingEngine {
  readonly canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private base: ImageBitmap | null = null
  private ops: DrawOp[] = []
  private redoStack: DrawOp[] = []
  private current: StrokeOp | null = null
  dirty = false

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = PAGE_W
    canvas.height = PAGE_H
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { willReadFrequently: true })!
    this.paintBackground()
  }

  private paintBackground() {
    this.ctx.fillStyle = '#ffffff'
    this.ctx.fillRect(0, 0, PAGE_W, PAGE_H)
    if (this.base) this.ctx.drawImage(this.base, 0, 0, PAGE_W, PAGE_H)
  }

  async loadState(baseBlob: Blob | null, opsJson: string | null | undefined): Promise<void> {
    this.ops = []
    this.redoStack = []
    this.base = null
    if (opsJson) {
      try {
        this.ops = JSON.parse(opsJson) as DrawOp[]
      } catch {
        this.ops = []
      }
    }
    // ops가 없으면 저장된 JPG를 base로 사용 (이어 그리기)
    if (this.ops.length === 0 && baseBlob) {
      try {
        this.base = await createImageBitmap(baseBlob)
      } catch {
        this.base = null
      }
    }
    this.replay()
    this.dirty = false
  }

  reset(): void {
    this.base = null
    this.ops = []
    this.redoStack = []
    this.paintBackground()
    this.dirty = true
  }

  get canUndo(): boolean {
    return this.ops.length > 0
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  serializeOps(): string {
    return JSON.stringify(this.ops)
  }

  // ---------- 스트로크 ----------
  beginStroke(tool: 'pencil' | 'brush' | 'eraser', color: string, size: number, x: number, y: number): void {
    this.current = { type: 'stroke', tool, color, size, points: [x, y] }
    this.drawSegment(this.current, x, y, x, y)
  }

  moveStroke(x: number, y: number): void {
    if (!this.current) return
    const pts = this.current.points
    const px = pts[pts.length - 2]
    const py = pts[pts.length - 1]
    pts.push(x, y)
    this.drawSegment(this.current, px, py, x, y)
  }

  endStroke(): void {
    if (!this.current) return
    this.ops.push(this.current)
    this.redoStack = []
    this.current = null
    this.dirty = true
  }

  /** 두 손가락 제스처 시작 등으로 진행 중이던 스트로크를 취소 */
  cancelStroke(): void {
    if (!this.current) return
    this.current = null
    this.replay()
  }

  private drawSegment(op: StrokeOp, x1: number, y1: number, x2: number, y2: number): void {
    const ctx = this.ctx
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (op.tool === 'eraser') {
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = op.size
    } else if (op.tool === 'brush') {
      ctx.strokeStyle = op.color
      ctx.lineWidth = op.size
      ctx.globalAlpha = 0.55
    } else {
      ctx.strokeStyle = op.color
      ctx.lineWidth = op.size
    }
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2 === x1 && y2 === y1 ? x2 + 0.01 : x2, y2)
    ctx.stroke()
    ctx.restore()
  }

  private drawStrokeOp(op: StrokeOp): void {
    const pts = op.points
    for (let i = 2; i < pts.length; i += 2) {
      this.drawSegment(op, pts[i - 2], pts[i - 1], pts[i], pts[i + 1])
    }
    if (pts.length === 2) this.drawSegment(op, pts[0], pts[1], pts[0], pts[1])
  }

  // ---------- 채우기 (flood fill) ----------
  fill(x: number, y: number, color: string): void {
    this.ops.push({ type: 'fill', x: Math.round(x), y: Math.round(y), color })
    this.redoStack = []
    this.execFill(Math.round(x), Math.round(y), color)
    this.dirty = true
  }

  private execFill(sx: number, sy: number, color: string): void {
    if (sx < 0 || sy < 0 || sx >= PAGE_W || sy >= PAGE_H) return
    const img = this.ctx.getImageData(0, 0, PAGE_W, PAGE_H)
    const data = img.data
    const idx = (sy * PAGE_W + sx) * 4
    const tr = data[idx]
    const tg = data[idx + 1]
    const tb = data[idx + 2]
    const [fr, fg, fb] = hexToRgb(color)
    if (tr === fr && tg === fg && tb === fb) return
    const tol = 40
    const match = (i: number) =>
      Math.abs(data[i] - tr) <= tol && Math.abs(data[i + 1] - tg) <= tol && Math.abs(data[i + 2] - tb) <= tol
    const stack: number[] = [sx, sy]
    const visited = new Uint8Array(PAGE_W * PAGE_H)
    while (stack.length) {
      const y = stack.pop()!
      const x = stack.pop()!
      let xl = x
      while (xl >= 0 && !visited[y * PAGE_W + xl] && match((y * PAGE_W + xl) * 4)) xl--
      xl++
      let xr = x
      while (xr < PAGE_W && !visited[y * PAGE_W + xr] && match((y * PAGE_W + xr) * 4)) xr++
      xr--
      if (xl > xr) continue
      for (let xi = xl; xi <= xr; xi++) {
        const p = y * PAGE_W + xi
        visited[p] = 1
        const i = p * 4
        data[i] = fr
        data[i + 1] = fg
        data[i + 2] = fb
        data[i + 3] = 255
        if (y > 0 && !visited[(y - 1) * PAGE_W + xi] && match(((y - 1) * PAGE_W + xi) * 4)) stack.push(xi, y - 1)
        if (y < PAGE_H - 1 && !visited[(y + 1) * PAGE_W + xi] && match(((y + 1) * PAGE_W + xi) * 4)) stack.push(xi, y + 1)
      }
    }
    this.ctx.putImageData(img, 0, 0)
  }

  // ---------- 전체 지우기 / 실행취소 ----------
  clearAll(): void {
    this.ops.push({ type: 'clear' })
    this.redoStack = []
    this.paintBackgroundOnly()
    this.dirty = true
  }

  private paintBackgroundOnly() {
    this.ctx.fillStyle = '#ffffff'
    this.ctx.fillRect(0, 0, PAGE_W, PAGE_H)
  }

  undo(): void {
    const op = this.ops.pop()
    if (!op) return
    this.redoStack.push(op)
    this.replay()
    this.dirty = true
  }

  redo(): void {
    const op = this.redoStack.pop()
    if (!op) return
    this.ops.push(op)
    this.applyOp(op)
    this.dirty = true
  }

  private applyOp(op: DrawOp): void {
    if (op.type === 'stroke') this.drawStrokeOp(op)
    else if (op.type === 'fill') this.execFill(op.x, op.y, op.color)
    else this.paintBackgroundOnly()
  }

  private replay(): void {
    this.paintBackground()
    // 마지막 clear 이후의 op만 다시 그리면 충분
    let start = 0
    for (let i = this.ops.length - 1; i >= 0; i--) {
      if (this.ops[i].type === 'clear') {
        start = i
        break
      }
    }
    for (let i = start; i < this.ops.length; i++) this.applyOp(this.ops[i])
  }

  toBlob(quality = 0.85): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('저장에 실패했어요.'))), 'image/jpeg', quality)
    })
  }
}
