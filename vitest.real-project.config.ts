import { defineConfig } from "vitest/config";

// The tests of the real tier (docs/development/TESTING.md, "Tests of the real tier"), which write to the cluster of
// the real project through the scripts of the test environment. They are not part of vitest.config.ts and run only
// via `pnpm test:real-project`, which the job of the real project of test-environment.yaml runs before it takes the
// environment down.
export default defineConfig({
  test: {
    name: "real-project",
    environment: "node",
    include: ["test/real-project/**/*.tests.ts"],
    // One real project, one test at a time: each holds the lock of the state folder of the scripts.
    fileParallelism: false,
    // A process of its own for each file: the scripts set their private umask, which a worker thread cannot.
    pool: "forks",
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
