import { defineConfig } from "vitest/config";

// The sessions of the real tier, which run on the cluster of the real project, in its job of test-environment.yaml,
// through vitest.integration-real-project.config.ts (docs/development/TESTING.md, "Continuous integration").
export const REAL_PROJECT_SESSIONS = [
  "integration/__tests__/clusters-real.tests.ts",
  "integration/__tests__/clusters-sveltos.tests.ts",
];

// The integration tests attach to Freelens dev over CDP and drive one app, so
// they are not part of vitest.config.ts and run only via
// `pnpm test:integration`, on the cluster of the definitions.
export default defineConfig({
  test: {
    name: "integration",
    environment: "node",
    include: ["integration/__tests__/**/*.tests.ts"],
    exclude: REAL_PROJECT_SESSIONS,
    // One app, one session at a time: each session installs the extension in
    // it, and the session of the fixtures opens its cluster.
    fileParallelism: false,
    // A process of its own for each file: a session that reaches a cluster
    // through the scripts of the test environment sets their private umask,
    // which a worker thread cannot.
    pool: "forks",
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
