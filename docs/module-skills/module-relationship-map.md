# Product-OS — Bản đồ quan hệ module

*Monorepo · 4 ứng dụng · backend NestJS (DDD) + MongoDB · frontend & saas-admin (React/Vite) · collab (Yjs)*

---

## 1 · Toàn cảnh hệ thống — 4 ứng dụng

```mermaid
%%{init: {'theme':'neutral', 'flowchart':{'curve':'basis'}}}%%
flowchart TB
  subgraph clients[" "]
    FE["🖥️ frontend<br/>React + Vite<br/><i>workspace người dùng</i>"]
    ADM["🛠️ saas-admin<br/>React + Vite<br/><i>vendor console</i>"]
  end

  API["⚙️ backend — NestJS<br/>REST /v1 · JWT · Swagger"]
  COL["🔗 collab — Hocuspocus<br/>Yjs realtime editing"]

  DB[("🍃 MongoDB<br/>Mongoose")]
  ST[("📦 Storage<br/>S3 / Azure Blob")]

  FE -->|"/v1 · JWT workspace"| API
  ADM -->|"/v1/platform · token vendor"| API
  FE -.->|"WebSocket · edit docs"| COL

  API --> DB
  API --> ST
  COL --> DB

  API -. "MCP server<br/>tích hợp AI" .-> FE

  classDef app fill:#e8eafd,stroke:#4f5bd5,stroke-width:2px,color:#1e2154;
  classDef data fill:#eef6f0,stroke:#3f9d6d,stroke-width:1.5px,color:#1d3d2c;
  class FE,ADM,API,COL app;
  class DB,ST data;
```

Bốn tiến trình chạy độc lập. `frontend` và `saas-admin` cùng gọi một backend nhưng qua **hai không gian token tách biệt** — JWT workspace không chạm được `/v1/platform`.

---

## 2 · Backend — kiến trúc DDD 3 lớp

```mermaid
%%{init: {'theme':'neutral'}}%%
flowchart LR
  subgraph P["presentation"]
    direction TB
    P1["Controllers<br/>Guards · Filters"]
  end
  subgraph A["application"]
    direction TB
    A1["Use-cases · DTOs<br/>Domain · Mappers"]
  end
  subgraph I["infrastructure"]
    direction TB
    I1["Repositories<br/>Mongoose entities"]
  end

  P1 -->|"gọi"| A1
  A1 -->|"phụ thuộc interface"| I1
  I1 -. "cài đặt repo" .-> A1

  G["🔒 JwtAuthGuard → RolesGuard<br/>(global)"] --> P1

  classDef l fill:#e8eafd,stroke:#4f5bd5,color:#1e2154;
  class P1,A1,I1,G l;
```

Mỗi domain module (`issues`, `teams`, `projects`…) đều có đủ 3 lát cắt này. `presentation` mount route dưới `/v1/<prefix>`.

---

## 3 · Quan hệ domain — `issue` là trung tâm

`issue` là một collection **đa hình** (`kind` = task / bug / …). Hầu hết module khác gắn vào nó qua khóa ngoại (`teamId`, `projectId`, `cycleId`, `roadmapId`, `parentId`, `assigneeId`, `labelKeys`, `reportId`).

```mermaid
%%{init: {'theme':'neutral', 'flowchart':{'curve':'basis'}}}%%
flowchart TB
  TENANT["🏢 tenant<br/><i>ranh giới SaaS</i>"]
  TEAM["👥 team<br/><i>sở hữu statuses/columns</i>"]
  PROJ["📁 project"]
  USER["🙋 user / group"]

  ISSUE(["🎯 <b>ISSUE</b><br/>task · bug"])

  CYCLE["🔁 cycle<br/>sprint"]
  MILE["🚩 milestone"]
  ROAD["🗺️ roadmap"]
  LABEL["🏷️ label"]
  CF["🧩 custom-field"]
  REPORT["🧪 report<br/>test-case"]
  LINK["🔗 issue-link"]

  ACT["📜 activity"]
  RCT["👍 reaction"]
  FAV["⭐ favourite"]
  INBOX["📨 inbox"]
  DOC["📄 doc"]

  TENANT --> TEAM --> PROJ
  TENANT --> USER
  TEAM --> ISSUE
  PROJ --> ISSUE
  USER -->|"assignee / reporter"| ISSUE
  ISSUE -->|"parentId (sub-task)"| ISSUE

  CYCLE --> ISSUE
  MILE --> ISSUE
  ROAD --> ISSUE
  LABEL --> ISSUE
  CF --> ISSUE
  REPORT --> ISSUE
  ISSUE --- LINK --- ISSUE

  ISSUE --> ACT
  ISSUE --> RCT
  ISSUE --> FAV
  ISSUE --> INBOX
  ISSUE -. "đính kèm / tham chiếu" .- DOC

  classDef org fill:#f3edfa,stroke:#8b5cf6,color:#3a2159;
  classDef core fill:#fde8ee,stroke:#d64f7a,stroke-width:2.5px,color:#5a1e34;
  classDef plan fill:#e8eafd,stroke:#4f5bd5,color:#1e2154;
  classDef social fill:#eef6f0,stroke:#3f9d6d,color:#1d3d2c;
  class TENANT,TEAM,PROJ,USER org;
  class ISSUE core;
  class CYCLE,MILE,ROAD,LABEL,CF,REPORT,LINK plan;
  class ACT,RCT,FAV,INBOX,DOC social;
```

**Đọc sơ đồ:** tổ chức (tím) chứa mọi thứ → `issue` (hồng, trung tâm) → các chiều lập kế hoạch (xanh dương) phân loại issue → lớp cộng tác (xanh lá) phản ứng theo mỗi issue.

---

## 4 · Nền tảng & tích hợp — bao quanh domain

```mermaid
%%{init: {'theme':'neutral'}}%%
flowchart LR
  AUTH["🔐 auth<br/>JWT · passport"]
  APIK["🔑 api-keys"]
  MCP["🤖 mcp<br/>Model Context Protocol"]
  WH["📡 webhooks"]
  PUB["🌐 public<br/>share link"]
  AUD["🧾 audit-log"]
  SET["⚙️ app-settings"]
  STORE["📦 storage"]
  PLAT["🏛️ platform / tenants<br/><i>saas-admin backend</i>"]

  CORE(["domain modules<br/>issues · teams · projects …"])

  AUTH --> CORE
  APIK --> CORE
  CORE --> AUD
  CORE --> WH
  CORE --> STORE
  MCP --> CORE
  PUB --> CORE
  SET --> CORE
  PLAT -->|"quản trị tenant / gói cước"| CORE

  classDef p fill:#fdf2e6,stroke:#c9862e,color:#5a3c14;
  classDef c fill:#fde8ee,stroke:#d64f7a,color:#5a1e34;
  class AUTH,APIK,MCP,WH,PUB,AUD,SET,STORE,PLAT p;
  class CORE c;
```

---

## 5 · Ánh xạ FE ⇄ BE

Mỗi feature ở `frontend/src/features/` gần như 1-1 với một domain module backend.

| Nhóm | frontend features | backend modules |
|---|---|---|
| **Nghiệp vụ** | issues · bugs · tasks · cycles · milestones · roadmaps · projects · reports | issues · bugs · tasks · cycles · milestones · roadmaps · projects · reports |
| **Tổ chức** | teams · groups · users · my-team · account | teams · groups · users |
| **Lập kế hoạch** | planning · labels · custom-fields | issues (labels/customFields) |
| **Cộng tác** | docs · inbox · activity · reactions · favourites · uploads | docs · inbox · activity · reactions · favourites · storage |
| **Nền tảng** | auth · settings · admin · api-keys · audit-log · mcp · public | auth · app-settings · platform · api-keys · audit-log · mcp · public |
| **SaaS admin** | *(saas-admin)* overview · plans · subscriptions · tenants · usage | platform · tenants · webhooks |

---

<p class="foot">Sinh ra từ đọc mã nguồn thực tế: <code>backend/src/{presentation,application,infrastructure}</code>, <code>frontend/src/features</code>, <code>saas-admin/src/features</code>, <code>collab/src</code>.</p>
