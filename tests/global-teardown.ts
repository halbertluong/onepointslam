export default async function globalTeardown() {
  // Intentionally light — test-specific cleanup runs in afterEach/afterAll hooks.
  // Auth files are committed to the test run but not the repo.
}
