# ASpark — Product Overview

> An open-source AI platform that generates full-stack web applications from natural language.

---

## Vision

Building software today still requires weeks of work across multiple disciplines — frontend, backend, database design, authentication, deployment. ASpark eliminates this barrier by letting anyone describe what they want and getting a working application in minutes.

**Our core belief:** The best code generator is one that produces standard, portable code you fully own — with zero vendor lock-in.

---

## How It Works

### Step 1 — Describe Your Idea

Type a natural language description on the homepage. ASpark provides 5 starter templates for common app types, or you can describe anything you imagine.

```
"Build me a financial analytics dashboard with user login,
 real-time charts, portfolio tracking, and CSV export."
```

### Step 2 — Plan Mode (Optional but Recommended)

Before writing any code, ASpark enters **Plan Mode**:

1. **AI asks clarifying questions** — target audience, core features, design preferences
2. **User answers** — select from multiple-choice options or provide free-form responses
3. **AI generates a structured plan** — including:
   - Application intent and scope
   - Target user personas
   - Core user flows
   - Data entities and relationships
   - Page structure
   - Technical requirements
4. **User reviews and approves** — or requests revisions

This step dramatically improves generation quality by ensuring the AI understands your intent before writing code.

### Step 3 — AI Generates the Application

Once approved, ASpark:

1. **Selects the optimal LLM** for the task (scaffold, iterate, refactor, or reason)
2. **Streams code generation** in real-time — you watch files appear as they're created
3. **Parses and validates** the generated code (syntax, imports, routes, types)
4. **Merges incrementally** with any existing code (for iterations)
5. **Boots a live preview** — Vite dev server with hot module replacement

The generation pipeline produces:
- React components and pages
- Tailwind CSS styling
- Supabase database schemas
- Authentication flows
- API route handlers
- Utility functions and type definitions

### Step 4 — Iterate Through Conversation

The Web IDE provides a chat panel where you can continue refining:

```
"Add a dark mode toggle to the header"
"Replace the bar chart with a line chart"
"Add pagination to the user table"
```

Each iteration uses the intelligent model router — smaller, faster models for simple changes, powerful reasoning models for complex refactors.

### Step 5 — Deploy or Export

- **One-click Vercel deploy** — get a production URL in seconds
- **ZIP download** — export the entire project and run it anywhere
- **Standard Next.js output** — no proprietary runtime, no SDK dependency

---

## Core Features

### 1. Multi-Model LLM Router

Unlike single-model platforms, ASpark routes each request to the best-suited model:

| Task Type | Model | Why |
|-----------|-------|-----|
| **Scaffold** | GPT-5.3 Codex | Strongest at generating complete project structures |
| **Iterate** | Kimi K2.5 | Fast, cost-effective for targeted changes |
| **Complete** | Doubao Flash | Ultra-low latency for inline completions |
| **Refactor** | GPT-5.3 Codex | Best at understanding large codebases |
| **Reason** | DeepSeek Reasoner | Chain-of-thought for algorithmic problems |
| **Default** | DeepSeek Chat | Strong general-purpose performance |

Adding a new provider requires implementing a single adapter function in `lib/llm/router.ts`.

### 2. Plan Mode

A structured requirement-gathering phase that sets ASpark apart from "prompt and pray" generators:

- **Multi-step Q&A** with AI-generated clarifying questions
- **Persistent sessions** stored in the database — close the browser, come back later
- **Structured output** — not just markdown, but a machine-readable JSON plan that feeds directly into code generation
- **Revision loop** — approve, reject, or request changes before any code is written

### 3. Web IDE Workspace

A full development environment in the browser:

- **Monaco Editor** — the same editor that powers VS Code
- **File tree** — navigate the entire project with expand/collapse
- **Three tabs** — Preview, Code, Dashboard
- **Version history** — every generation creates a snapshot; roll back anytime
- **Suggestion chips** — AI-generated next steps appear after each build

### 4. Live Preview System

- **Embedded Vite dev server** with hot module replacement
- **Process manager** handles server lifecycle (boot, restart, cleanup)
- **File manager** writes generated code to disk and triggers HMR updates
- **Background building** — generation continues even when the user navigates away
- **Build status polling** — client checks progress every 3 seconds with visual indicators

### 5. Auto-Fix Engine

When the preview encounters runtime errors:

1. Error is captured and parsed automatically
2. AI generates a targeted fix based on error context
3. Fix is applied and preview reboots
4. Process repeats up to 3 times
5. If all attempts fail, human-readable suggestions are shown

### 6. Code Generation Pipeline

The generation engine is more than just "send prompt, get code":

```
Prompt → Context Selection → Prompt Layering → LLM Streaming
    → XML/Markdown Parsing → File Merging → Syntax Validation
    → Post-Generation Checks → Refactor Detection → Output
```

Key components:
- **Parser** (`code-gen/parser.ts`) — Extracts files from LLM output (XML tags or markdown code blocks)
- **File Merger** (`code-gen/file-merger.ts`) — Intelligently merges new code with existing files
- **Validator** (`code-gen/validator.ts`) — Checks TypeScript compilation, imports, route signatures
- **Refactor Checker** (`code-gen/refactor-checker.ts`) — Detects when changes require broader refactoring
- **Context Selector** (`prompts/context-selector.ts`) — Picks relevant existing files to include in the prompt
- **Token Estimator** (`prompts/token-estimator.ts`) — Prevents context window overflow

### 7. Database Integration

- **Schema Extraction** — AI extracts entity definitions from natural language requirements
- **Auto-execution** — SQL schemas are applied to Supabase automatically
- **RLS Policies** — Row-Level Security generated per table for multi-tenant safety
- **Data Service Templates** — Pre-built CRUD helpers included in generated apps
- **Supabase Auth** — Authentication templates ready to use

### 8. Deployment & Export

| Method | Description |
|--------|-------------|
| **Vercel Deploy** | One-click deployment via Vercel SDK; returns a live production URL |
| **ZIP Export** | Download the entire project as a zip file using JSZip |
| **Local Development** | Generated apps are standard Next.js projects — `npm run dev` just works |

---

## Tech Stack

### Platform (apps/web)

| Category | Technology |
|----------|-----------|
| Framework | Next.js 14.2 (App Router) |
| UI | React 18, Tailwind CSS, Radix UI, shadcn/ui |
| Editor | Monaco Editor (VS Code engine) |
| State | Zustand 5.0 |
| AI | Vercel AI SDK with multi-provider support |
| Database | Supabase (PostgreSQL + Auth + Realtime) |
| Deploy | Vercel SDK |
| Monorepo | Turborepo + pnpm |
| Language | TypeScript 5.7 (strict) |

### Generated Apps

| Category | Technology |
|----------|-----------|
| Framework | Next.js 14 (or React + Vite) |
| UI | Tailwind CSS, shadcn/ui (25 pre-built components) |
| Backend | Supabase (PostgreSQL + Auth + Storage) |
| Validation | Zod |
| Icons | Lucide React |
| Type Safety | TypeScript |

---

## Comparison with Similar Platforms

| Feature | ASpark | v0.dev | Bolt.new | Base44 |
|---------|--------|--------|----------|--------|
| **Open source** | Yes | No | Partial | No |
| **Self-hostable** | Yes | No | No | No |
| **Multi-model routing** | Yes | No | No | No |
| **Plan mode (requirement gathering)** | Yes | No | No | No |
| **Full code ownership** | Yes | Yes | Yes | Limited |
| **No vendor lock-in** | Yes | Partial | Partial | No |
| **Live preview with HMR** | Yes | No | Yes | Yes |
| **Auto-fix errors** | Yes | No | Yes | Yes |
| **One-click deploy** | Yes | No | Yes | Yes |
| **Built-in database** | Supabase | No | No | Proprietary |
| **Web IDE** | Yes | No | Yes | Yes |
| **Version history** | Yes | Yes | Yes | Yes |
| **Visual editor** | Planned | No | No | Yes |
| **Collaboration** | Planned | No | No | Yes |
| **Template marketplace** | Planned | Yes | Yes | Yes |

### Where ASpark Excels

1. **Open source & self-hostable** — Run on your own infrastructure, audit every line of code
2. **Multi-model intelligence** — Each task gets the best model, not a one-size-fits-all approach
3. **Plan Mode** — Structured requirement analysis produces higher-quality first generations
4. **No lock-in** — Generated apps are standard Next.js projects with no proprietary SDK
5. **Extensible** — Add LLM providers, templates, and integrations through clean interfaces

### Where ASpark is Catching Up

1. **Visual editing** — Direct UI manipulation (in development)
2. **Built-in integrations** — Email, payments, file storage as first-class features
3. **Template marketplace** — Broader selection of starter templates
4. **Collaboration** — Real-time multi-user editing
5. **GitHub sync** — Two-way repository synchronization

---

## Database Schema

ASpark's platform database (not the generated apps) uses the following structure:

| Table | Purpose |
|-------|---------|
| `users` | User accounts with plan tier and API key storage |
| `projects` | Project metadata, status, and URLs |
| `project_files` | File storage with version tracking |
| `generation_sessions` | Code generation session logs with token usage |
| `plan_sessions` | Plan mode sessions with Q&A state |
| `project_entities` | Data model definitions |
| `project_messages` | Chat history between user and AI |
| `app_settings` | Per-project configuration |

All tables implement Row-Level Security (RLS) policies ensuring users can only access their own data.

---

## API Reference

### Generation

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/generate` | Stream code generation (scaffold / iterate / refactor / reason) |
| `GET` | `/api/projects/[id]/build/status` | Poll build progress |
| `GET` | `/api/builds/active` | List all active builds |

### Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/projects` | Create a new project |
| `GET` | `/api/projects` | List user's projects |
| `GET` | `/api/projects/[id]` | Get project details |
| `PATCH` | `/api/projects/[id]` | Update project metadata |
| `DELETE` | `/api/projects/[id]` | Delete a project |

### Plan Mode

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/projects/[id]/plan/questions` | Get clarifying questions |
| `POST` | `/api/projects/[id]/plan/generate` | Generate plan from answers |
| `POST` | `/api/projects/[id]/plan/approve` | Approve plan and start build |
| `GET` | `/api/projects/[id]/plan/session` | Get current plan session |

### Preview

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/projects/[id]/preview/start` | Boot Vite dev server |
| `POST` | `/api/projects/[id]/preview/stop` | Stop dev server |
| `GET` | `/api/projects/[id]/preview/health` | Health check |
| `POST` | `/api/projects/[id]/preview/update` | Push file changes (triggers HMR) |

### Files & Messages

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/projects/[id]/files` | List project files |
| `POST` | `/api/projects/[id]/files` | Create or update files |
| `GET` | `/api/projects/[id]/files/versions` | Get file version history |
| `GET` | `/api/projects/[id]/messages` | Get chat history |
| `POST` | `/api/projects/[id]/messages` | Save chat messages |

### Deployment

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/projects/[id]/deploy` | Deploy to Vercel |

### Other

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/projects/[id]/suggestions` | AI improvement suggestions |
| `POST` | `/api/schema` | Execute database schema |

---

## Roadmap

### Short-term (v1.1)
- Built-in authentication system (auto-generate login/register with Supabase Auth)
- Database automation (extract entities from prompt → generate tables + CRUD APIs)
- Responsive preview (mobile / tablet / desktop viewport switching)

### Mid-term (v1.5)
- Visual editor (click-to-edit UI elements in preview)
- Template marketplace with 50+ categorized starters
- GitHub integration (push generated projects to repos)
- Comprehensive test coverage for core generation pipeline

### Long-term (v2.0)
- Real-time collaboration (multi-user editing)
- Built-in integrations ecosystem (email, payments, file storage, AI calls)
- Multi-deploy targets (Netlify, Cloudflare Pages, Docker)
- Containerized sandboxes (E2B / WebContainers for isolated preview environments)
- Credit-based billing system for hosted version
- CLI tool for local development workflows

---

## Community

- **GitHub Issues** — Bug reports and feature requests
- **Discussions** — Questions and ideas
- **Pull Requests** — Contributions welcome

---

*ASpark is built with AI, for builders.*
