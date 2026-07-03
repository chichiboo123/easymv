# easy MV 실시간 서버 (Cloudflare Worker)

앱을 **서버 없이(브라우저 저장)** 쓰는 게 기본입니다. 이 Worker는 **선택 기능**으로, 학생이
**다른 기기·집에서도** 코드로 접속해 그림을 제출하고, 그 그림이 교사의 뮤직비디오 편집기로
자동으로 모이게 해줍니다.

- 저장하는 것: 프로젝트 설정 JSON(KV) + 학생 그림 JPG(R2)
- 저장하지 않는 것: **음원·완성 영상**(브라우저에서만 처리) · 계정 정보
- 프로젝트는 마지막 저장 후 **90일 뒤 자동 삭제**(KV TTL + 매일 정리 크론)

## 준비물

- Cloudflare 계정(무료)
- Node.js 18+ 설치된 PC

## 배포 순서

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
