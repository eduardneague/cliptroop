// 1.52.0: Vercel builds only what someone opens. The owner (Nov 16 2026), before Vercel Pro: "make sure the 20$ a
// month is more than enough". On Pro every build is billed by the minute, and Vercel built every branch pushed to
// GitHub: Dependabot's update branches too, again each time it refreshed them. Those are checked by GitHub's CI
// (types, lint, tests, the build itself), so Vercel now builds production (main) and staging only.
//
// Vercel runs this as the project's Ignored Build Step (vercel.json "ignoreCommand") before each build: exit 1 builds,
// exit 0 skips. If anything goes wrong in here, Node exits 1, so the build goes ahead.
import { fileURLToPath } from "node:url";

/** Whether Vercel should build this push. */
export function shouldBuild(env) {
  if (env.VERCEL_ENV === "production") return true;
  return (env.VERCEL_GIT_COMMIT_REF ?? "") === "staging";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ref = process.env.VERCEL_GIT_COMMIT_REF ?? "(no branch)";
  if (shouldBuild(process.env)) {
    console.log(`[vercel-ignore] building ${ref} (${process.env.VERCEL_ENV ?? "?"})`);
    process.exit(1);
  }
  console.log(`[vercel-ignore] skipped ${ref}: only main and staging are built on Vercel (GitHub's CI checks the rest)`);
  process.exit(0);
}
