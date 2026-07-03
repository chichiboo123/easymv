# easy MV 실시간 서버 (Cloudflare Worker)

앱을 **서버 없이(브라우저 저장)** 쓰는 게 기본입니다. 이 Worker는 **선택 기능**으로, 학생이
**다른 기기·집에서도** 코드로 접속해 그림을 제출하고, 그 그림이 교사의 뮤직비디오 편집기로
자동으로 모이게 해줍니다.

- 저장하는 것: 프로젝트 설정 JSON(KV) + 학생 그림 JPG(R2)
- 저장하지 않는 것: **음원·완성 영상**(브라우저에서만 처리) · 계정 정보
- 프로젝트는 마지막 저장 후 **90일 뒤 자동 삭제**(KV TTL + 매일 정리 크론)

## 준비물

- Cloudflare 계정(무료)

배포 방법은 두 가지입니다. **터미널(Node.js + wrangler CLI)** 을 쓸 수 있으면 아래 "배포 순서"를,
터미널 없이 **웹 브라우저(dash.cloudflare.com)** 만으로 하고 싶으면 맨 아래
["웹 대시보드로만 배포하기"](#웹-대시보드로만-배포하기) 항목을 따라가세요.

## 배포 순서 (터미널 · wrangler CLI)

아래는 모두 `worker/` 폴더에서 실행합니다.

```bash
cd worker
npm install
npx wrangler login          # 브라우저에서 Cloudflare 로그인 1회
```

### 1) KV 네임스페이스 만들기 (프로젝트 JSON 저장)

```bash
npx wrangler kv namespace create PROJECTS
```

출력에 나온 `id = "xxxx…"` 값을 복사해 **`wrangler.toml`** 의 `<KV_NAMESPACE_ID>` 자리에 붙여넣습니다.

### 2) R2 버킷 만들기 (학생 그림 저장)

```bash
npx wrangler r2 bucket create easymv-drawings
```

(이름을 바꾸면 `wrangler.toml` 의 `bucket_name` 도 같이 바꾸세요.)

> R2를 처음 켤 때 대시보드에서 결제수단(카드) 등록을 요구할 수 있습니다. 무료 한도(10GB·전송 무료)
> 안에서는 요금이 청구되지 않습니다.

### 3) 관리자 키 설정 (교사만 프로젝트를 서버에 올릴 수 있게)

```bash
npx wrangler secret put ADMIN_KEY
# 원하는 비밀 문자열을 입력 (예: 길고 아무도 모르는 값)
```

이 값이 **관리자 키**입니다. 교사가 앱에서 서버 연결을 켤 때 입력하는 값과 같아야 합니다.
(이 키를 아는 사람만 프로젝트를 서버에 올릴 수 있습니다. 학생은 키 없이 코드만으로 그림을 제출합니다.)

### 4) 허용 출처(CORS) 확인

`wrangler.toml` 의 `ALLOWED_ORIGINS` 를 앱 주소로 맞춥니다. 기본값 `https://easymv.chichiboo.link`.
(로컬 테스트로 `http://localhost:4173` 등을 추가하려면 쉼표로 이어 적으세요.)

### 5) 배포

```bash
npx wrangler deploy
```

배포가 끝나면 주소가 출력됩니다:

- 기본: `https://easymv-api.<계정서브도메인>.workers.dev`
- 또는 커스텀 도메인 라우트(선택): `https://api.easymv.chichiboo.link`
  (Cloudflare 대시보드 → Workers → 해당 Worker → Settings → Domains & Routes 에서 연결)

### 6) 앱에 서버 주소 알려주기

이 Worker 주소를 앱 빌드에 넣어야 합니다. GitHub 저장소에서:

**Settings → Secrets and variables → Actions → Variables → New repository variable**

- Name: `VITE_API_BASE`
- Value: 위에서 나온 Worker 주소 (끝에 `/` 없이)

저장 후 앱을 다시 배포(빈 커밋 push 또는 Actions 재실행)하면 서버 기능이 활성화됩니다.

## 로컬에서 테스트 (선택)

```bash
cd worker
npx wrangler dev          # http://localhost:8787 에서 로컬 KV/R2 시뮬레이션으로 실행
```

## 무료 한도 메모

- **KV**: 읽기 넉넉, 쓰기 하루 1,000회. 앱은 학생이 "저장/완성"을 누를 때만 서버에 쓰도록
  설계되어 한 반(수십 명) 규모에서 문제없습니다.
- **R2**: 10GB 저장 · 전송 무료. 그림(페이지당 ~300KB)에 충분합니다.
- **Workers**: 하루 10만 요청.

---

## 웹 대시보드로만 배포하기

터미널을 쓰지 않고 **dash.cloudflare.com** 화면 클릭만으로 진행하는 절차입니다. 코드는
`worker/dashboard-worker.js` 파일(순수 JavaScript, `src/index.ts`와 로직 동일)을 그대로
복사해서 붙여넣습니다.

### 1) KV 네임스페이스 만들기

1. [dash.cloudflare.com](https://dash.cloudflare.com) 로그인
2. 왼쪽 메뉴 **Workers & Pages → KV**
3. **Create a namespace** 클릭 → 이름에 `PROJECTS` 입력 → **Add**

### 2) R2 버킷 만들기

1. 왼쪽 메뉴 **R2 Object Storage**
2. 처음이면 **Enable R2** (결제수단 등록을 요구할 수 있으나, 무료 한도 10GB·전송 무료 안에서는
   요금이 청구되지 않습니다)
3. **Create bucket** → 이름 `easymv-drawings` → **Create bucket**

### 3) Worker 만들기

1. 왼쪽 메뉴 **Workers & Pages → Overview → Create**
2. **Create Worker** 선택 → 이름을 `easymv-api` 로 입력 → **Deploy** (기본 "Hello World" 코드로 먼저 배포됨)
3. 배포 완료 화면에서 **Edit code** (또는 Worker 상세 페이지의 **Quick edit**) 클릭
4. 에디터에 기본으로 들어있는 코드를 전부 지우고, 이 저장소의 `worker/dashboard-worker.js` 파일
   내용을 전체 복사해서 붙여넣기
5. **Save and deploy** 클릭

### 4) 바인딩 연결 (KV·R2를 Worker에 연결)

Worker 상세 페이지 → **Settings → Variables** (버전에 따라 **Settings → Bindings** 로 표시될 수 있음)

1. **KV Namespace Bindings → Add binding**
   - Variable name: `PROJECTS`
   - KV namespace: 1단계에서 만든 `PROJECTS` 선택
2. **R2 Bucket Bindings → Add binding**
   - Variable name: `DRAWINGS`
   - R2 bucket: 2단계에서 만든 `easymv-drawings` 선택
3. **Save**

### 5) 환경 변수 · 관리자 키 설정

같은 **Settings → Variables** 화면에서:

1. **Environment Variables → Add variable**
   - Name: `ALLOWED_ORIGINS`
   - Value: 앱 주소 (예: `https://easymv.chichiboo.link`)
   - Type: **Text** (일반 텍스트)
2. 관리자 키 추가 — **Add variable**
   - Name: `ADMIN_KEY`
   - Value: 아무도 모를 긴 비밀 문자열을 직접 입력 (이게 **관리자 키**입니다 — 잘 기억해두세요.
     이 키를 아는 사람=선생님만 프로젝트를 서버에 올릴 수 있습니다)
   - Type: **반드시 "Encrypt"(암호화) 체크** — 비밀 값이므로 평문으로 두지 마세요
3. **Save and deploy** (저장하면 새 버전으로 다시 배포됩니다)

### 6) 90일 자동 정리 크론 등록 (선택이지만 권장)

Worker 상세 페이지 → **Settings → Triggers → Cron Triggers → Add Cron Trigger**

- Cron expression: `0 3 * * *` (매일 새벽 3시 UTC)
- **Add trigger**

### 7) Worker 주소 확인 (+ 선택: 커스텀 도메인)

- 기본 주소는 Worker 개요 화면 상단에 `https://easymv-api.<계정서브도메인>.workers.dev` 형태로
  표시됩니다. 이 주소를 그대로 써도 됩니다.
- 원하면 **Settings → Domains & Routes → Add → Custom Domain** 에서
  `api.easymv.chichiboo.link` 같은 주소를 연결할 수 있습니다(도메인이 이미 Cloudflare에 있으므로
  DNS 레코드가 자동 생성됩니다).

### 8) 앱에 서버 주소 알려주기 (GitHub, 여기도 웹 화면만 사용)

GitHub 저장소 페이지에서:

**Settings → Secrets and variables → Actions → Variables 탭 → New repository variable**

- Name: `VITE_API_BASE`
- Value: 7단계에서 확인한 Worker 주소 (끝에 `/` 없이)

**Add variable** 로 저장한 뒤, **Actions** 탭 → 가장 최근 "Deploy to GitHub Pages" 실행 옆
**⋯ → Re-run all jobs** 를 누르면 서버 기능이 켜진 채로 앱이 다시 배포됩니다.

> `VITE_API_BASE`가 없으면 앱은 지금처럼 서버리스로만 동작하니, 설정 전이라도 안전합니다.

### 확인 방법

Worker 주소 뒤에 `/api/health` 를 붙여 브라우저에서 열었을 때 `{"ok":true}` 가 보이면
정상 배포된 것입니다. (예: `https://easymv-api.내계정.workers.dev/api/health`)
