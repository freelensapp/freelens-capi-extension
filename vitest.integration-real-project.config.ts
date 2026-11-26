import { defineConfig } from "vitest/config";
import { REAL_PROJECT_SESSIONS } from "./vitest.integration.config";

// The sessions of the real tier in Freelens dev (SPEC-0004, "With the real project"; docs/development/TESTING.md,
// "Tests of the real tier"), which open the cluster of the real project and reach it through the scripts of the test
// environment. They are not part of `pnpm test:integration` and run only via `pnpm test:integration:real-project`,
// which the job of the real project of test-environment.yaml runs, on each release of Freelens of the integration
// tests, before it takes the environment down.
export default defineConfig({
  test: {
    name: "integration-real-project",
    environment: "node",
    include: REAL_PROJECT_SESSIONS,
    // One app and one real project, one session at a time: each holds the lock of the state folder of the scripts.
    fileParallelism: false,
    // A process of its own for each file: the scripts set their private umask, which a worker thread cannot.
    pool: "forks",
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
