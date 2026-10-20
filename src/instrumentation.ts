/**
 * Server error reporting. Every uncaught error in a route, server component or action is
 * logged as one structured JSON line (picked up by Vercel's log drains). Query strings,
 * headers, cookies and bodies are deliberately not logged, as they can contain personal data
 * or tokens. To forward errors to a hosted service (e.g. Sentry), add it here.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  const err = error as { message?: string; digest?: string; name?: string };
  console.error(
    JSON.stringify({
      level: "error",
      source: "hidden-kenya",
      at: new Date().toISOString(),
      name: err.name ?? "Error",
      message: (err.message ?? String(error)).slice(0, 500),
      digest: err.digest,
      method: request.method,
      route: context.routePath,
      routeType: context.routeType,
      path: request.path.split("?")[0],
    }),
  );
}
