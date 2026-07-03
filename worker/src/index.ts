/**
 * easy MV 실시간 서버 (Cloudflare Worker)
 *
 * 저장소:
 *  - KV(PROJECTS): `project:{id}` = 프로젝트 메타데이터 JSON (그림 제외). 90일 TTL.
 *  - R2(DRAWINGS): `draw/{id}/{index}.jpg` = 학생 그림.
 *
 * 접근 모델(저민감 교실 도구):
 *  - 코드(projectId)를 알면 프로젝트 조회 + 그림 제출 가능
 *  - PIN = 교사 편집/삭제 권한
 *  - 프로젝트 생성(서버에 올리기) = 관리자 키(ADMIN_KEY) 필요 → 교사만 가능
 *  - 공개 조회 응답에서는 PIN을 절대 노출하지 않음
 */

export interface Env {
  PROJECTS: KVNamespace
  DRAWINGS: R2Bucket
  ADMIN_KEY?: string
  ALLOWED_ORIGINS?: string
}

const TTL_SECONDS = 60 * 60 * 24 * 90 // 90일

interface ServerPage {
  index: number
  lyric: string
  position: string | null
  studentName: string | null
  status: 'empty' | 'drawing' | 'done'
  updatedAt: string | null
}
interface ServerProject {
  projectId: string
  pin: string
  title: string
  createdAt: string
  studentCount: number
  font: string
  fontSize: string
  lyricPosition: string
  requireName: boolean
  pages: ServerPage[]
}

// ---------- CORS ----------
function corsHeaders(env: Env, origin: string | null): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  let allowOrigin = '*'
  if (allowed.length && origin && allowed.includes(origin)) allowOrigin = origin
  else if (allowed.length) allowOrigin = allowed[0]
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key, X-Pin',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(data: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
  })
}

function sanitize(p: ServerProject): Omit<ServerProject, 'pin'> {
  const { pin: _pin, ...rest } = p
  return rest
}

const key = (id: string) => `project:${id}`
const drawKey = (id: string, index: number) => `draw/${id}/${index}.jpg`

async function readProject(env: Env, id: string): Promise<ServerProject | null> {
  return env.PROJECTS.get<ServerProject>(key(id), 'json')
}
async function writeProject(env: Env, p: ServerProject): Promise<void> {
  await env.PROJECTS.put(key(p.projectId), JSON.stringify(p), { expirationTtl: TTL_SECONDS })
}

// ---------- 라우팅 ----------
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin')
    const cors = corsHeaders(env, origin)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

    const url = new URL(request.url)
    const parts = url.pathname.split('/').filter(Boolean) // ["api","projects",...]

    try {
      if (parts[0] !== 'api') return json({ error: 'not_found' }, 404, cors)

      if (parts[1] === 'health') return json({ ok: true }, 200, cors)

      // /api/projects ...
      if (parts[1] === 'projects') {
        // POST /api/projects  (create, admin)
        if (parts.length === 2 && request.method === 'POST') {
          if (!isAdmin(request, env)) return json({ error: 'admin_required' }, 401, cors)
          const body = (await request.json()) as ServerProject
          if (!body?.projectId || !Array.isArray(body.pages)) return json({ error: 'bad_body' }, 400, cors)
          const existing = await readProject(env, body.projectId)
          if (existing && existing.pin !== body.pin) return json({ error: 'id_taken' }, 409, cors)
          await writeProject(env, normalizeIncoming(body, existing))
          return json({ ok: true, projectId: body.projectId, pin: body.pin }, 200, cors)
        }

        const id = parts[2]
        if (!id) return json({ error: 'not_found' }, 404, cors)

        // /api/projects/:id
        if (parts.length === 3) {
          if (request.method === 'GET') {
            const p = await readProject(env, id)
            if (!p) return json({ error: 'not_found' }, 404, cors)
            return json(sanitize(p), 200, cors)
          }
          if (request.method === 'PUT') {
            const p = await readProject(env, id)
            const body = (await request.json()) as ServerProject
            if (!p) {
              // 최초 저장이면 관리자 키로 생성 허용
              if (!isAdmin(request, env)) return json({ error: 'not_found' }, 404, cors)
              await writeProject(env, normalizeIncoming(body, null))
              return json({ ok: true }, 200, cors)
            }
            if (!authorized(request, env, p)) return json({ error: 'pin_required' }, 401, cors)
            await writeProject(env, normalizeIncoming(body, p))
            return json({ ok: true }, 200, cors)
          }
          if (request.method === 'DELETE') {
            const p = await readProject(env, id)
            if (!p) return json({ ok: true }, 200, cors)
            if (!authorized(request, env, p)) return json({ error: 'pin_required' }, 401, cors)
            await deleteProject(env, id)
            return json({ ok: true }, 200, cors)
          }
        }

        // POST /api/projects/:id/auth  {pin}
        if (parts.length === 4 && parts[3] === 'auth' && request.method === 'POST') {
          const p = await readProject(env, id)
          if (!p) return json({ error: 'not_found' }, 404, cors)
          const body = (await request.json().catch(() => ({}))) as { pin?: string }
          return json({ ok: p.pin === (body.pin ?? '') }, 200, cors)
        }

        // /api/projects/:id/pages/:index/drawing
        if (parts.length === 6 && parts[3] === 'pages' && parts[5] === 'drawing') {
          const index = Number(parts[4])
          if (!Number.isInteger(index)) return json({ error: 'bad_index' }, 400, cors)

          if (request.method === 'GET') {
            const obj = await env.DRAWINGS.get(drawKey(id, index))
            if (!obj) return json({ error: 'not_found' }, 404, cors)
            return new Response(obj.body, {
              status: 200,
              headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-cache', ...cors },
            })
          }

          if (request.method === 'PUT') {
            const p = await readProject(env, id)
            if (!p) return json({ error: 'not_found' }, 404, cors)
            const page = p.pages.find((pg) => pg.index === index)
            if (!page) return json({ error: 'no_page' }, 404, cors)

            const force = url.searchParams.get('force') === '1'
            const base = url.searchParams.get('base') || ''
            // 동시 편집 충돌: 내가 마지막으로 본 시점(base) 이후에 다른 저장이 있었으면 경고
            if (!force && page.updatedAt && base && page.updatedAt > base) {
              return json(
                { error: 'conflict', updatedAt: page.updatedAt, studentName: page.studentName },
                409,
                cors,
              )
            }

            const bytes = await request.arrayBuffer()
            if (bytes.byteLength === 0 || bytes.byteLength > 3_000_000)
              return json({ error: 'bad_image' }, 400, cors)
            await env.DRAWINGS.put(drawKey(id, index), bytes, {
              httpMetadata: { contentType: 'image/jpeg' },
            })

            const name = url.searchParams.get('name')
            const now = new Date().toISOString()
            page.status = url.searchParams.get('done') === '1' ? 'done' : 'drawing'
            page.updatedAt = now
            if (name) page.studentName = name
            await writeProject(env, p)
            return json({ ok: true, updatedAt: now }, 200, cors)
          }
        }
      }

      return json({ error: 'not_found' }, 404, cors)
    } catch (e) {
      return json({ error: 'server_error', message: String(e) }, 500, cors)
    }
  },

  // 만료된(KV에서 사라진) 프로젝트의 R2 그림을 정리
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    const seen = new Set<string>()
    let cursor: string | undefined
    do {
      const list = await env.DRAWINGS.list({ prefix: 'draw/', cursor, limit: 1000 })
      for (const obj of list.objects) {
        const id = obj.key.split('/')[1]
        if (!id || seen.has(id)) continue
        seen.add(id)
        const exists = await env.PROJECTS.get(key(id))
        if (!exists) {
          const orphan = await env.DRAWINGS.list({ prefix: `draw/${id}/` })
          for (const o of orphan.objects) await env.DRAWINGS.delete(o.key)
        }
      }
      cursor = list.truncated ? list.cursor : undefined
    } while (cursor)
  },
}

function isAdmin(request: Request, env: Env): boolean {
  if (!env.ADMIN_KEY) return true // 키 미설정 시 게이트 없음(개발용)
  return request.headers.get('X-Admin-Key') === env.ADMIN_KEY
}

function authorized(request: Request, env: Env, p: ServerProject): boolean {
  if (isAdmin(request, env) && env.ADMIN_KEY) return true
  return request.headers.get('X-Pin') === p.pin
}

/** 들어온 프로젝트를 저장 가능한 형태로 정리 (기존 페이지 상태·그림 진행은 보존) */
function normalizeIncoming(body: ServerProject, existing: ServerProject | null): ServerProject {
  const pages: ServerPage[] = body.pages.map((pg, i) => {
    const old = existing?.pages.find((o) => o.index === (pg.index ?? i + 1))
    return {
      index: pg.index ?? i + 1,
      lyric: pg.lyric ?? '',
      position: pg.position ?? null,
      studentName: old?.studentName ?? pg.studentName ?? null,
      status: old?.status ?? 'empty',
      updatedAt: old?.updatedAt ?? null,
    }
  })
  return {
    projectId: body.projectId,
    pin: body.pin ?? existing?.pin ?? '',
    title: body.title ?? '',
    createdAt: existing?.createdAt ?? body.createdAt ?? new Date().toISOString(),
    studentCount: body.studentCount ?? pages.length,
    font: body.font ?? 'Jua',
    fontSize: body.fontSize ?? 'md',
    lyricPosition: body.lyricPosition ?? 'bottom',
    requireName: Boolean(body.requireName),
    pages,
  }
}

async function deleteProject(env: Env, id: string): Promise<void> {
  await env.PROJECTS.delete(key(id))
  const list = await env.DRAWINGS.list({ prefix: `draw/${id}/` })
  for (const o of list.objects) await env.DRAWINGS.delete(o.key)
}
