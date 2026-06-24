/**
 * instrumentation.ts  (Next.js App Router instrumentation hook)
 * ─────────────────────────────────────────────────────────────────────────────
 * next-ws v2 NO LONGER uses instrumentation.ts for its bootstrap.
 *
 * In v2, the WebSocket server is wired up by the `next-ws patch` CLI command,
 * which injects `setupWebSocketServer(this)` directly into the
 * NextNodeServer constructor inside `next/dist/server/next-server.js`.
 * That injection runs automatically on every `next start` / `next dev` —
 * no code in this file is needed for WebSocket support.
 *
 * This file is kept because Next.js requires `instrumentation.ts` to be
 * present if the `experimental.instrumentationHook` option is enabled (or
 * in Next.js 16+ where it is always active). An empty `register()` export
 * satisfies that requirement without side-effects.
 *
 * If you need to add OpenTelemetry tracing or other startup logic in the
 * future, add it inside `register()` below.
 */

export async function register() {
  // Intentionally empty — next-ws v2 patches Next.js at the binary level.
  // See: `next-ws patch` CLI command and `package.json#scripts.prepare`.
}
