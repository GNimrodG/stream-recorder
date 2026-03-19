# AGENTS Guide

## Scope and source of truth
- This file captures repo-specific guidance for AI coding agents in `stream-recorder`.
- Existing AI instruction files found via glob search: `README.md` only.
- Product behavior and API contract are primarily documented in `README.md`; auth deployment details are in `AUTHENTICATION.md`.

## Big picture architecture
- App is a Next.js App Router project (`src/app`) with server APIs under `src/app/api/**/route.ts` and React/MUI client UIs in `src/app/**` + `src/components/**`.
- Core recording orchestration lives in `src/lib/RecordingManager.ts`; each scheduled recording gets one in-memory manager instance keyed by recording `id`.
- Persistent state is JSON-file based (no DB): recordings in `data/recordings.json`, settings in `data/settings.json`, streams in `data/streams.json` via `src/lib/{recordings,settings,streams}.ts`.
- Startup side effects matter: `ensureRecordingsInitialized()` (used by pages/routes) restores pending recordings and starts storage cleanup scheduler.
- Auth boundary is in `src/proxy.ts` + `src/auth.ts`; middleware injects `x-pathname` header so server `Sidebar` can highlight navigation.

## Domain and data flow essentials
- Recording lifecycle states are in `src/types/recording.ts`: `scheduled -> starting/recording/retrying -> completed|failed|cancelled`.
- `createRecording()` in `src/lib/recordings.ts` both persists a record and immediately constructs `RecordingManager`.
- `RecordingManager` retries when stream drops, records attempts as part files, then merges via `mergeRecordingParts()` in `src/lib/ffmpeg.ts`.
- Stream liveness checks use raw RTSP `DESCRIBE` sockets in `src/lib/stream.ts` with host-level request queues (one active check per host).
- Storage cleanup (`src/lib/storage.ts`) is periodic and destructive (deletes files + DB entries) based on settings limits.

## API and integration patterns
- Recording routes (`src/app/api/recordings/**`) are thin wrappers around `src/lib/recordings.ts` and manager actions (`?action=start|stop|disableLiveCheck|enableLiveCheck`).
- Live preview path (`src/app/api/recordings/[id]/preview/route.ts`) returns HTML by default, or raw JPEG when `?raw=true`.
- Playback path (`src/app/api/recordings/[id]/stream/route.ts`) streams completed files with range support; if output file is missing but recording is active, it transcodes live RTSP to fragmented MP4.
- FFmpeg path and codec behavior are settings-driven (`src/lib/settings.ts`, `src/lib/ffmpeg.ts`); avoid hardcoding command args in new code.
- Authentik/NextAuth integration is optional: auth is automatically bypassed when required env vars are missing or `AUTH_DISABLED=true`.

## Developer workflows (project-specific)
- Use Yarn scripts from `package.json`: `yarn dev`, `yarn build`, `yarn start`, `yarn lint`, `yarn test`.
- Tests are Vitest-based and currently focus on stream probing and manager behavior (`test/stream.test.ts`, `test/RecordingManager.test.ts`) with heavy module mocking.
- Docker runtime expects GPU-oriented image choices (`Dockerfile`, `docker-compose.yml`), including NVIDIA runtime and static FFmpeg with NVENC-enabled build.
- Logs are part of normal debugging: per-recording logs in `logs/recording_<id>.log` are exposed by `/api/recordings/[id]/logs`.
- To run tests use the command `yarn test run` so it doesn't watch for file changes.

## Conventions to preserve when editing
- Keep API handlers thin; put business logic in `src/lib/*` and shared types in `src/types/*`.
- Reuse existing JSON persistence helpers instead of introducing alternate storage layers.
- Maintain `@/*` path alias imports and strict TypeScript settings from `tsconfig.json`.
- When adding auth-sensitive routes/pages, update `src/proxy.ts` public route handling intentionally.
- If a change affects recording lifecycle, update both orchestration (`RecordingManager`) and status shaping (`getRecordingStatus`) so UI/API stay consistent.

