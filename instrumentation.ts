/*
 * Next.js calls onRequestError for every error on the server: pages, server
 * actions, route handlers, middleware. They're counted and alerted on by
 * lib/errors.ts (error log + emails, no outside service).
 */
export async function register() {
  // Nothing to set up.
}

type RequestInfo = { path: string; method: string; headers: Record<string, string | string[] | undefined> };
type ErrorContext = { routerKind: string; routePath: string; routeType: string; renderSource?: string };

export async function onRequestError(err: unknown, request: RequestInfo, context: ErrorContext) {
  // Written as an if-block (not an early return) so the Edge build drops the
  // import entirely: lib/errors uses Node-only modules.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { isControlFlow, reportError } = await import("./lib/errors");
    if (isControlFlow(err)) return;
    const e = err instanceof Error ? err : new Error(String(err));
    const userId = request.headers["x-vp-verified-user-id"];
    await reportError({
      source: "server",
      message: e.message,
      stack: e.stack ?? null,
      // The route pattern ("/shorts/[id]") groups the same error across videos.
      route: `${request.method} ${context.routePath || request.path}${context.routeType ? ` (${context.routeType})` : ""}`,
      digest: (err as { digest?: string }).digest ?? null,
      userId: typeof userId === "string" ? userId : null,
    });
  }
}
