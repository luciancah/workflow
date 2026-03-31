# Conductor OSS + Next.js Workflow Builder (MVP)

## Goal
- React Flow 기반 워크플로우 작성 UI
- 워크플로우를 Postgres에 저장
- Conductor OSS 메타/실행 API와 동기화
- 실행 이력 + task 로그 캐시 조회

## 현재 프로젝트 구조

```text
workflow/
├─ app/                     # Next.js App Router, 라우팅/서버 API
│  ├─ page.tsx              # 루트 페이지
│  ├─ layout.tsx
│  ├─ workflows/
│  │  ├─ page.tsx           # 워크플로우 목록 페이지
│  │  ├─ new/page.tsx       # 새 워크플로우 생성 페이지
│  │  └─ [id]/page.tsx      # 워크플로우 빌더 페이지 라우트 진입점
│  └─ api/
│     ├─ workflows/
│     │  ├─ route.ts                    # 워크플로우 목록/생성
│     │  ├─ [id]/route.ts               # 워크플로우 조회/수정
│     │  ├─ [id]/execute/route.ts       # 실행 트리거
│     │  └─ [id]/executions/route.ts     # 실행 이력 조회
│     └─ executions/
│        ├─ [executionId]/route.ts       # 실행 상태 동기화 + 스텝 동기화
│        └─ [executionId]/logs/route.ts  # 캐시 로그 조회
├─ components/
│  ├─ WorkflowBuilderPage.tsx # React Flow 에디터, JSON/폼 편집 탭, 실행/히스토리 탭
│  └─ ...
├─ lib/
│  ├─ workflowConverter.ts   # React Flow → Conductor DSL 변환 레이어
│  ├─ conductor.ts          # Conductor REST 연동
│  ├─ db.ts                 # Postgres CRUD/스키마/이력 저장
│  ├─ types.ts              # Node/Graph/Conductor 타입 정의
│  └─ ...
├─ worker/
│  └─ src/runner.js         # ai_mock, teams_mock 등 SIMPLE task poller
├─ infra/
│  └─ conductor/config/...  # Conductor DB 설정 파일
├─ docker-compose.yml
└─ (postgres, npm/pnpm 설정 파일)
```

## 전체 실행 구조
- `docker-compose`로 구성
  - PostgreSQL (app metadata + 실행 로그 저장)
  - Conductor Server + Postgres persistence
  - Node.js simulator worker (`ai_mock`, `teams_mock` 포함)
  - Next.js 웹앱

### 데이터/실행 플로우(요약)

```mermaid
flowchart LR
    A[사용자: React Flow 편집] --> B[API: POST/PATCH /api/workflows]
    B --> C[lib/workflowConverter.ts 변환]
    C --> D[Conductor 메타 등록\nPOST/PUT /api/metadata/workflow]
    B --> E[PostgreSQL 워크플로우 저장]
    E --> A
    F[사용자: Run] --> G[POST /api/workflows/[id]/execute]
    G --> H[Conductor 실행 POST /workflow]
    H --> I[workflow_runs 생성]
    I --> J[UI 폴링 GET /api/executions/:id]
    J --> K[Conductor 실행 조회 + tasks 조회]
    K --> L[캐시 테이블 workflow_runs/steps 갱신]
    L --> M[UI 로그 렌더]
```

## 빠른 시작
1. 환경변수 파일 준비
   - `cp .env.example .env.local`
   - 로컬에서 `npm run dev`로 직접 실행할 경우 `.env.local`의 값은 호스트 기준으로 바꿔야 합니다.
     - `DATABASE_URL=postgres://workflow:workflow@localhost:5433/workflow_db`
     - `CONDUCTOR_BASE_URL=http://localhost:8080/api`
   - 도커 컴포즈 환경에서는 기존 예시 값(`postgres`, `conductor` 호스트명)을 그대로 사용하세요.
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

## Conductor 구조 -> React Flow 변환 과정 (상세)

현재 변환은 [lib/workflowConverter.ts](/Users/luciancah/Documents/Github/workflow/lib/workflowConverter.ts) 에서 일괄 처리합니다.  
요청 경로 기준으로는:
- 신규 생성: [app/api/workflows/route.ts](/Users/luciancah/Documents/Github/workflow/app/api/workflows/route.ts) → `buildConductorPayload`
- 수정: [app/api/workflows/[id]/route.ts](/Users/luciancah/Documents/Github/workflow/app/api/workflows/[id]/route.ts) → `buildConductorPayload`

### 1) 입력 데이터 규격
프론트엔드가 보내는 JSON은 React Flow 표준과 거의 동일한 형태입니다.

```json
{
  "nodes": [
    { "id": "start-1", "type": "workflowNode", "position": {...}, "data": { "type": "start", ... } },
    { "id": "ai-1", "type": "workflowNode", "data": { "type": "ai", "prompt": "..." } }
  ],
  "edges": [
    { "id": "e1", "source": "start-1", "target": "ai-1", "label": "..." }
  ]
}
```

`data.type`은 `[start|ai|teams|branch|wait|terminate|script|fork|join]` 중 하나입니다.

### 2) 변환 진입점과 핵심 함수

`POST /api/workflows` 또는 `PATCH /api/workflows/[id]` 호출 시:
1. `buildConductorPayload(graph, workflowName, version, description)` 호출
2. 내부에서 `compileFlowToConductor()` 실행
3. `conversion.tasks` 배열이 만들어지면
4. `lib/conductor.ts`의 `registerConductorWorkflow` 또는 `updateConductorWorkflow`로 Conductor 메타 동기화
5. 변환 결과(JSON)는 `workflows` 테이블의 `conductor_compiled_json`에 저장

### 3) build 단계 상세

`compileFlowToConductor()`는 먼저 다음 검증을 수행합니다.

#### A. 그래프 인덱스 생성
`buildGraphIndex`에서:
- `nodeMap`: 노드 id → 노드 객체
- `outMap`: 출발 노드 id → outgoing edges 배열
- `inMap`: 목표 노드 id → incoming edges 배열

으로 그래프 탐색에 필요한 사전 인덱스를 만듭니다.

#### B. 정합성 규칙 검증
- Start 노드는 **정확히 1개**여야 함.
- Start의 outgoing은 **최대 1개**.
- Start가 아닌 노드가 incoming을 2개 이상 가지면 기본적으로 에러:
  - `join` 노드만 병합 지점으로 허용(병렬 조인 고려)
- Branch 노드(`branch`)에서 나오는 간선은 라벨이 필수:
  - 라벨 누락 시 `FlowConversionError`

#### C. 직렬 태스크 flatten
`flattenLinear(startId, nodeMap, outMap)`:
- Start에서 시작해 한 단계씩 다음 노드를 따라 이동
- `node.type !== 'branch'`이면 노드를 Conductor task로 변환해 `tasks`에 push
- Branch(분기)는 특별 처리:
  - 각 outgoing edge를 따라 하위 경로를 재귀적으로 flatten
  - 라벨을 Conductor `decisionCases[label]` 키로 매핑
  - case expression: `\${workflow.input.<switchParam>}` (기본 `branchValue`)
- Branch 노드에서는 더 이상 선형 진행을 이어가지 않고 분기 블록으로 종료
- non-branch 노드에서 outgoing이 2개 이상이면 에러:
  - 분기가 필요한 노드는 Branch를 사용해야 한다는 정책 적용
- path set을 관리해 loop(순환 간선) 감지: 재방문 시 `FlowConversionError("Loop detected ...")`

### 4) 노드 → Conductor Task 매핑

`toTask()`에서 노드 타입별 매핑:

- `ai` → `SIMPLE`, `mockType: 'ai_mock'`  
  - `inputParameters.prompt`, retry 설정(있으면) 반영
- `teams` → `SIMPLE`, `mockType: 'teams_mock'`  
  - `channel`, `message`, retry 설정 반영
- `script` → `INLINE`
  - `inputParameters.script`, `language: 'javascript'`
- `wait` → `WAIT`
  - `inputParameters.value` = `waitMs` (기본 1000)
- `terminate` → `TERMINATE`
  - `terminationType`, `terminationMessage`
- `branch` → `SWITCH`
  - `evaluatorType: 'value-param'`
  - `caseExpression`는 `workflow.input.<switchParam>`
  - 각 라벨별 `decisionCases`
- `fork` → `FORK` (현재 실험 단계)
- `join` → `JOIN` (현재 실험 단계)

`taskReferenceName`은 React Flow 노드 ID 그대로 사용되므로, Conductor task 로그 추적 시 UI-DB 연동이 일관됩니다.

### 5) 결과 포맷
최종적으로 다음 형태의 `Conductor payload`가 만들어집니다.

```json
{
  "name": "wf_xxx",
  "description": "...",
  "version": 1,
  "tasks": [
    {
      "name": "ai_1",
      "taskReferenceName": "ai_1",
      "type": "SIMPLE",
      "inputParameters": { "mockType": "ai_mock", ... }
    }
  ]
}
```

현재 버전은 생성/수정 시 `conductor_compiled_json` 전체를 저장하고 DB row의 `version`을 함께 올리며, Conductor 메타에도 동일 version으로 반영합니다.

### 6) 변환 예시

#### 예시 1: 선형 흐름 (Start → AI → Teams)

입력 React Flow:

```json
{
  "nodes": [
    {
      "id": "start-a",
      "type": "workflowNode",
      "position": { "x": 0, "y": 0 },
      "data": { "type": "start", "label": "Start" }
    },
    {
      "id": "ai-a",
      "type": "workflowNode",
      "position": { "x": 160, "y": 0 },
      "data": { "type": "ai", "label": "AI", "prompt": "요약해줘", "retryCount": 2 }
    },
    {
      "id": "teams-a",
      "type": "workflowNode",
      "position": { "x": 320, "y": 0 },
      "data": { "type": "teams", "label": "Teams", "message": "안내 시작", "channel": "ops" }
    }
  ],
  "edges": [
    { "id": "e1", "source": "start-a", "target": "ai-a" },
    { "id": "e2", "source": "ai-a", "target": "teams-a" }
  ]
}
```

출력 Conductor 작업:

```json
{
  "name": "wf_170...",
  "description": "예시 워크플로우",
  "version": 1,
  "tasks": [
    {
      "name": "ai-a_ai_mock",
      "taskReferenceName": "ai-a",
      "type": "SIMPLE",
      "retryCount": 2,
      "inputParameters": {
        "mockType": "ai_mock",
        "sourceNode": "AI",
        "prompt": "요약해줘"
      }
    },
    {
      "name": "teams-a_teams_mock",
      "taskReferenceName": "teams-a",
      "type": "SIMPLE",
      "inputParameters": {
        "mockType": "teams_mock",
        "sourceNode": "Teams",
        "message": "안내 시작",
        "channel": "ops"
      }
    }
  ]
}
```

주의: 현재 버전은 `toConductorInputNode`에서 `name`을 `${id}_${mockType}`으로 구성합니다.

#### 예시 2: Branch + Label 분기

입력 React Flow (브랜치 라벨 필수):

```json
{
  "nodes": [
    { "id": "start-b", "type": "workflowNode", "position": { "x": 0, "y": 0 }, "data": { "type": "start", "label": "Start" } },
    { "id": "branch-b", "type": "workflowNode", "position": { "x": 160, "y": 0 }, "data": { "type": "branch", "label": "Check", "switchParam": "branchValue" } },
    { "id": "term-success", "type": "workflowNode", "position": { "x": 320, "y": -60 }, "data": { "type": "terminate", "label": "Success", "terminateType": "SUCCESS", "terminateMessage": "OK" } },
    { "id": "term-fail", "type": "workflowNode", "position": { "x": 320, "y": 80 }, "data": { "type": "terminate", "label": "Fail", "terminateType": "FAILURE", "terminateMessage": "NOK" } }
  ],
  "edges": [
    { "id": "e1", "source": "start-b", "target": "branch-b" },
    { "id": "e2", "source": "branch-b", "target": "term-success", "label": "success" },
    { "id": "e3", "source": "branch-b", "target": "term-fail", "label": "fail" }
  ]
}
```

출력 Conductor 작업(요약):

```json
{
  "name": "wf_170...",
  "description": "...",
  "version": 1,
  "tasks": [
    {
      "name": "branch-b_switch",
      "taskReferenceName": "branch-b",
      "type": "SWITCH",
      "evaluatorType": "value-param",
      "caseExpression": "${workflow.input.branchValue}",
      "decisionCases": {
        "success": [
          {
            "name": "term-success_terminate",
            "taskReferenceName": "term-success",
            "type": "TERMINATE",
            "inputParameters": {
              "terminationType": "SUCCESS",
              "terminationMessage": "OK"
            }
          }
        ],
        "fail": [
          {
            "name": "term-fail_terminate",
            "taskReferenceName": "term-fail",
            "type": "TERMINATE",
            "inputParameters": {
              "terminationType": "FAILURE",
              "terminationMessage": "NOK"
            }
          }
        ]
      },
      "defaultCase": []
    }
  ]
}
```

#### 예시 3: 실패 케이스 예시 (검증 에러)

1) Start가 2개:
- 에러 메시지: `Workflow must include exactly one start node.`
  
2) Branch 간선 라벨 없음:
- 에러 메시지: `Branch node branch-b requires label on every outgoing edge.`

3) 루프:
- A→B→C→A 형태 간선이면 에러 메시지: `Loop detected in workflow graph.`

## Conductor 동기화 규칙 (현재 구현)
- 생성: `POST /api/metadata/workflow` (단일 객체)
- 수정: `PUT /api/metadata/workflow` (배열 형태 `[{...}]`)
- 실행 트리거: `POST /api/workflow` (`name`, `version`, `input`, `correlationId`)
- 상태/로그 조회:  
  - `GET /workflow/{workflowId}`
  - `GET /workflow/{workflowId}/tasks`
- 실행 API는 Conductor에 워크플로우가 없어도 404 대응:
  - `POST /api/workflows/[id]/execute`에서 재등록 후 재실행
  - 구현 위치: [app/api/workflows/[id]/execute/route.ts](/Users/luciancah/Documents/Github/workflow/app/api/workflows/[id]/execute/route.ts)

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

## 파일/구조 참조 (실전 위주)
- 빌더 UI: [components/WorkflowBuilderPage.tsx](/Users/luciancah/Documents/Github/workflow/components/WorkflowBuilderPage.tsx)
- 변환 엔진: [lib/workflowConverter.ts](/Users/luciancah/Documents/Github/workflow/lib/workflowConverter.ts)
- Conductor API 어댑터: [lib/conductor.ts](/Users/luciancah/Documents/Github/workflow/lib/conductor.ts)
- DB/스키마: [lib/db.ts](/Users/luciancah/Documents/Github/workflow/lib/db.ts)
- 타입: [lib/types.ts](/Users/luciancah/Documents/Github/workflow/lib/types.ts)
- 실행/로그 API: 
  - [app/api/workflows/[id]/execute/route.ts](/Users/luciancah/Documents/Github/workflow/app/api/workflows/[id]/execute/route.ts)
  - [app/api/executions/[executionId]/route.ts](/Users/luciancah/Documents/Github/workflow/app/api/executions/[executionId]/route.ts)
  - [app/api/executions/[executionId]/logs/route.ts](/Users/luciancah/Documents/Github/workflow/app/api/executions/[executionId]/logs/route.ts)
- 시뮬레이터 워커: [worker/src/runner.js](/Users/luciancah/Documents/Github/workflow/worker/src/runner.js)

## 현재 기준 구현 상태 체크(요약)
- 저장/조회/수정은 DB+Conductor 메타 동기화 방식으로 완료
- 리스트/상세/실행/실행이력 조회는 MVP 기준 동작
- 실행 중/완료 후 상태는 `Conductor`를 주원본으로 캐시 갱신
- 1차 회귀 대응: Conductor 워크플로우 미등록 이슈에 대해 실행 시 재등록 후 재시도 보정
- 다만 템플릿/확장 아이디어(웹훅 트리거, Retry 정책 UI, HTTP/Transform 강화)는 현재 보조 단계

## 템플릿 라우팅/UI 매핑(현재 반영 상태)

현재 구현은 템플릿 구조를 기반으로 다음 레이어를 맞췄습니다.

- 라우팅
  - `/` : 시작 화면(워크플로우 생성 진입점)  
  - `/workflows` : 최신 워크플로우가 있으면 즉시 이동(템플릿의 최신 진입 동작)
  - `/workflows/[id]` : 템플릿형 에디터 뷰(캔버스/우측 탭)
  - `/workflows/list` : 기존 목록 기능 분리(`list`로 이동)
  - `/workflows/new` : 단순 생성 보조 진입(기존 API 경로 유지)

- UI 구성 대응
  - 상단 툴바: `[components/WorkflowBuilderPage.tsx](/Users/luciancah/Documents/Github/workflow/components/WorkflowBuilderPage.tsx)`의 `wf-toolbar`/`Run`/`Save`
  - 캔버스: `ReactFlow` + 커스텀 노드 `workflowNode`, 엣지 `wf-edge` + `AnimatedWorkflowEdge`
  - 우측 패널: `Properties`, `Code`, `Runs` 탭
  - 노드 렌더: `WorkflowNode` + `wf-node-card`, `wf-node-status`를 이용한 카드형 뷰
  - 상태 갱신: `setInterval` 기반 폴링 (`GET /api/executions/:id`)

- React Flow JSON ↔ Conductor 변환 연동
  - UI 저장/실행 전에는 항상 `reactFlowJson`을 `/api/workflows` 또는 `/api/workflows/:id`로 전달
  - 서버는 이를 [lib/workflowConverter.ts](/Users/luciancah/Documents/Github/workflow/lib/workflowConverter.ts)로 `conductorCompiledJson`으로 변환
  - 실행은 `conductorName/version` 기준으로 Conductor API 호출 (`app/api/workflows/[id]/execute/route.ts`)

### UI 예시 트레이스 (간단)

시나리오: `Start → AI → Branch(success/fail)` 를 캔버스에 구성하고 `Code` 탭에서 아래 JSON 저장 시:

```text
Start ──▶ AI ──▶ Branch(label: success) ──▶ Terminate(SUCCESS)
                   └─▶ Branch(label: fail) ─────▶ Terminate(FAILURE)
```

실행 후 `Runs` 탭에서:
- `workflow runs` 목록
- 선택 run의 Conductor 실행 컨텍스트 JSON
- task별 로그/출력 타임라인
을 순차적으로 확인할 수 있습니다.
