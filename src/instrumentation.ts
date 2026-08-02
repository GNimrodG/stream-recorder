/**
 * Next.js invokes this hook when the server process starts, before it begins
 * handling requests. Restore scheduled/in-progress recordings here so manager
 * recovery does not depend on a user opening a page after a restart.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { ensureAppRuntimeInitialized } = await import("@/lib/runtime");
  ensureAppRuntimeInitialized();
}
