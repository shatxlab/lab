// Test-only browser bundle; never imported by the live island.
// npx esbuild scripts/tycoon/stage6-persistence-harness.ts --bundle --platform=browser --format=iife --global-name=CareerHarness --alias:@=./src --outfile=/tmp/stage6-persistence-harness.js
export { createCareerPersistence } from '../../src/lib/tycoon/career-persistence'
export { browserCareerLock, CAREER_SAVE_LOCK } from '../../src/lib/tycoon/career-transactions'
export { createInitialState } from '../../src/lib/tycoon/sim/state'
