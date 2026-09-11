# Product Spec / 제품 스펙

**App:** System Design Interview Canvas / 시스템 디자인 인터뷰 공유 캔버스  
**Module:** AIDT 2026 — Module 2  
**Status:** v1 draft for coding agents (Step 1/6 complete when reviewed)

---

## 1. Overview / 개요

면접관이 인터뷰 세션을 만들고 참여 링크를 공유한다. 지원자(및 다른 참여자)는 링크로 같은 방에 들어와, **시스템 디자인 다이어그램**을 같은 캔버스에서 함께 편집한다. 변경은 **실시간**으로 모든 참여자에게 반영된다.

이 스펙은 코딩 에이전트에 넘길 **제품 정의**다. 구현 스택의 세부 코드는 다루지 않는다.

---

## 2. Users / 사용자

| Role | 한글 | 할 수 있는 일 |
|------|------|----------------|
| Interviewer | 면접관 | 세션 생성, 참여 링크 공유, 캔버스 관찰·편집 |
| Candidate / Participant | 지원자·참여자 | 링크로 참여, 표시 이름 입력, 캔버스 편집 |
| Multi-user | 다수 동시 참여 | 한 세션에 여러 명이 동시에 접속·편집 |

v1 인증은 **최소화**한다. (표시 이름 + 세션 링크 수준으로 시작 가능. 소셜 로그인·결제·팀 관리 없음.)

---

## 3. User Stories / 유저 스토리

1. **세션 생성**  
   As an interviewer, I want to create an interview session so that I get a shareable join link.

2. **링크로 참여**  
   As a candidate, I want to open a join link and enter a display name so that I can enter the same canvas room.

3. **컴포넌트 배치**  
   As a participant, I want to place system-design components on the canvas so that I can sketch an architecture.

4. **연결**  
   As a participant, I want to connect components with arrows so that data/control flow is visible.

5. **메모·라벨**  
   As a participant, I want sticky notes / short labels so that I can annotate the diagram.

6. **자유 스케치**  
   As a participant, I want free-form drawing so that I can sketch ideas beyond boxes and arrows.

7. **실시간 동기화**  
   As any participant, I want others’ edits to appear without refresh so that the interview stays collaborative.

8. **동시 다수 참여**  
   As an interviewer, I want multiple people in one session so that observers or co-interviewers can join.

---

## 4. Acceptance Criteria / 수락 기준

### 4.1 Session / 세션

- [ ] 면접관이 새 세션을 만들 수 있다.
- [ ] 생성 후 **공유 가능한 join link**가 제공된다.
- [ ] 링크를 연 사용자는 **표시 이름(display name)** 을 넣고 세션에 참여할 수 있다.
- [ ] 같은 링크로는 **여러 명**이 동시에 참여할 수 있다.
- [ ] 존재하지 않거나 만료/잘못된 링크면 명확한 오류(또는 안내)를 본다.

### 4.2 Canvas objects / 캔버스 객체

참여자는 다음을 할 수 있다.

- [ ] **Components / 컴포넌트** 배치·이동·삭제  
  최소 세트(v1):
  - Service / Box (서비스)
  - Database (DB)
  - Queue / Message broker (큐)
  - Cache (캐시)
  - Load balancer (로드밸런서)
  - LLM / API call (LLM·외부 API)
- [ ] 컴포넌트를 **arrows / 화살표**로 연결
- [ ] **Sticky note / 스티키 노트** 또는 짧은 라벨 추가·편집
- [ ] **Free-form drawing / 자유 스케치** (펜 스트로크)
- [ ] 자신이 만든(또는 권한이 있는) 객체를 선택·이동·수정·삭제

### 4.3 Realtime / 실시간

- [ ] 한 사용자의 추가·이동·수정·삭제가 **같은 세션의 다른 사용자**에게 새로고침 없이 반영된다.
- [ ] 양방향이어야 한다. (면접관 → 지원자, 지원자 → 면접관 모두)
- [ ] Presence(커서·접속자 목록)는 **있으면 좋음(nice-to-have)**. 없어도 v1 수락을 막지 않는다. 단, 캔버스 객체 동기화는 필수다.
- [ ] 연결이 끊기면 사용자가 인지할 수 있는 상태(재연결 시도 또는 안내)가 있다. (세부는 구현 단계에서)

### 4.4 Persistence (later step, specify intent) / 저장 (이후 단계에서 구현)

제품 의도:

- [ ] 서버 재시작 후에도 세션·캔버스 상태가 유지되어야 한다.  
  → 구현은 이후 단계(SQLite + SQLAlchemy). 스펙 단계에서는 **요구만** 명시.

### 4.5 Quality bar for “works” / “동작한다”의 최소 기준

수동 검증 시나리오:

1. 창 A에서 세션 생성 → join link 복사  
2. 창 B(시크릿/다른 브라우저)에서 링크 입장 + 이름 입력  
3. B에서 컴포넌트 추가 → A에 보여야 함  
4. A에서 객체 이동/추가 → B에 보여야 함  
5. (저장 단계 이후) 서버 재시작 후에도 같은 세션 내용이 남아야 함  

---

## 5. Main flows / 주요 흐름

### Flow A — Interviewer creates session

1. 앱 진입  
2. “Create session / 세션 만들기”  
3. 세션 화면 + **join link** 표시  
4. 링크를 지원자에게 전달  

### Flow B — Candidate joins

1. join link 오픈  
2. display name 입력  
3. 공유 캔버스 입장  
4. 편집 시작  

### Flow C — Collaborative editing

1. 참여자가 컴포넌트/화살표/노트/스케치 추가  
2. 실시간으로 다른 참여자 화면에 반영  
3. 인터뷰 진행  

---

## 6. Canvas object model (high level) / 캔버스 객체 모델 (고수준)

논리 모델(저장·동기화 단위):

| Object | 설명 | 주요 속성(예시) |
|--------|------|-----------------|
| Session | 인터뷰 방 | id, join_code/link, created_at, status |
| Participant | 참여자 | id, session_id, display_name, role(optional) |
| Node / Component | 박스형 노드 | id, type, position(x,y), size, label, style |
| Edge / Arrow | 연결선 | id, from_node_id, to_node_id, label(optional) |
| StickyNote | 메모 | id, position, text |
| Stroke / Freehand | 자유 스케치 | id, points[], stroke style |
| (Optional) Presence | 커서 등 | participant_id, cursor position |

Realtime 이벤트(개념):

- `object_created` / `object_updated` / `object_deleted`
- (optional) `presence_updated`
- room 단위 fan-out (같은 session의 구독자에게 전달)

---

## 7. Screens (minimum) / 최소 화면

1. **Home / Landing** — 세션 생성 진입  
2. **Session / Canvas** — 툴바 + 캔버스 + (가능하면) 참여자/링크 영역  
3. **Join gate** — 링크 진입 시 이름 입력  

---

## 8. Non-goals / 하지 않음 (v1)

- 결제, 빌링, 구독  
- 소셜 로그인 필수화  
- 팀/조직 워크스페이스 관리  
- 풀 Figma·화이트보드 클론 (컴포넌트 세트는 인터뷰용으로 작게)  
- 음성/영상 통화  
- AI가 다이어그램을 자동 채점·생성 (이번 모듈 범위 밖)  
- Docker / CI / CD / 클라우드 배포 (Module 3 이후)  
- Postgres 프로덕션 DB (로컬은 이후 SQLite; Postgres는 더 나중)

---

## 9. Technical constraints / 기술 제약 (의도)

아티클·모듈 경로에 맞춘 **의도**이며, 이 문서만으로 구현을 강제하는 세부 API는 다음 단계(OpenAPI)에서 고정한다.

| Layer | Intent |
|-------|--------|
| Frontend | 웹 UI (React 계열 프로토타입부터 시작 가능). 백엔드 호출은 **service layer**에 모은다. 초기에는 mock 가능. |
| Contract | 이후 `openapi.yaml`로 FE/BE 계약을 명시한다. |
| Backend | FastAPI (모듈 기본). 처음엔 in-memory store → 이후 SQLite. |
| DB | SQLAlchemy 등으로 **database-agnostic** 유지. 로컬 SQLite, 이후 Postgres 교체 가능해야 함. |
| Realtime | WebSocket(또는 동등)으로 room/session fan-out. |
| Tests | 단계마다 검증. 유닛/프론트 테스트는 이후 단계에서 강화. |
| Agent hygiene | `AGENTS.md`, 정기 git commit. 큰 작업은 새 에이전트 세션. |

---

## 10. Out of scope for Step 1 checklist / 1단계 체크

이 스펙 문서가 있으면 Step 1/6의 산출물은 준비된 것이다. 다음을 확인한다.

- [x] who creates a session — 면접관  
- [x] how a candidate joins — join link + display name  
- [x] which components on the canvas — 위 최소 세트 + arrows + sticky + freehand  
- [x] how both see changes in real time — WebSocket(등) room sync, 양방향  
- [x] (학습자 검토) “이대로 만들어도 된다”고 승인 — 2026-09-08  

승인 완료(1/6). 다음: **Frontend First / 프론트 먼저** (mock service layer 포함 프로토타입).

---

## 11. Reference / 참고

- Course article: Build and Ship a Full-Stack App with AI Coding Assistants  
- Reference repo direction: https://github.com/alexeygrigorev/interview-canvas-share  
- Module lesson: cohorts/2026/02-development  

---

**Reviewer note:** 이 초안은 코스 기본 예제(시스템 디자인 인터뷰 캔버스) 범위다. 숙제 문구의 “코딩 인터뷰 플랫폼(코드 편집·WASM 실행)”과는 제품이 다를 수 있다. 숙제를 그대로 따를지, 아티클 앱을 따를지는 별도 결정이다. 현재 가이드 본선은 **아티클 앱**이다.
