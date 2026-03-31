# Conductor OSS + Next.js Workflow Builder (MVP)

## Goal
- React Flow 기반 워크플로우 작성 UI
- 워크플로우를 Postgres에 저장
- Conductor OSS 메타/실행 API와 동기화
- 실행 이력 + task 로그 캐시 조회

## 실행 구조
- `docker-compose`로 구성
  - PostgreSQL (app metadata + 실행 로그 저장)
  - Conductor Server + Postgres persistence
  - Node.js simulator worker (`ai_mock`, `teams_mock` 포함)
  - Next.js 웹앱

## 빠른 시작
1. 환경변수 파일 준비
   - `cp .env.example .env.local`
2. Compose 실행
   - `docker compose up -d --build`
3. 웹앱 접속
   - `http://localhost:3000`

## 핵심 API
- `POST /api/workflows` / `GET /api/workflows`
- `PATCH /api/workflows/[id]`, `GET /api/workflows/[id]`
- `POST /api/workflows/[id]/execute`
- `GET /api/workflows/[id]/executions`
- `GET /api/executions/[executionId]`
- `GET /api/executions/[executionId]/logs`

## 지원 노드(1차)
- Start
- AI (`ai_mock` SIMPLE)
- Teams (`teams_mock` SIMPLE)
- Branch (`SWITCH`)
- Wait (`WAIT`)
- Terminate (`TERMINATE`)
- Script (`INLINE`)
- Fork/Join (실험용 노출)

## 전환 규칙(요약)
- React Flow 시작 노드 1개 필수
- Branch에서만 분기 라벨 사용 의무
- 기본은 순차 실행으로 task flatten
- Branch는 분기 라벨을 Conductor `SWITCH` 의 `decisionCases`로 매핑

## 향후 확장 아이디어
- Webhook trigger, retry 정책, fork/join 병렬, transform, http request 등
