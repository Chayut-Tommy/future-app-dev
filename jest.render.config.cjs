module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/**/*.render.test.tsx'],
  // expo-font (a top-level dependency) imports the bare specifier
  // 'expo-asset' expecting Metro's bundler-level resolution to find it —
  // Metro finds it fine at build time because the `expo` package itself
  // depends on expo-asset, but npm installed it nested under
  // node_modules/expo/node_modules/expo-asset rather than hoisting it to
  // top level, which plain Node/Jest module resolution cannot see. This
  // maps the bare specifier to its real installed location so any
  // component importing @expo/vector-icons (most of the app's UI) can be
  // rendered under Jest. Pre-existing dependency-tree fact, not a new
  // package or a version change.
  moduleNameMapper: {
    '^expo-asset$': '<rootDir>/node_modules/expo/node_modules/expo-asset',
  },
  // Pass 2E final correction, §7 — the default (parallel) `npm run
  // test:render` was empirically confirmed flaky: three consecutive
  // default runs produced 0, 12, and 3 failing tests respectively (never
  // the same failures twice), each accompanied by "You seem to have
  // overlapping act() calls" console errors and "A worker process has
  // failed to exit gracefully" — every one of these suites mounts a full
  // real NavigationContainer + AppStateProvider + AsyncStorage-mock tree
  // (several now via the full RootNavigator, not just one tab navigator),
  // and under genuine multi-worker parallelism these heavy, timer-bearing
  // trees (e.g. TodayScreen.tsx's 400ms deferred celebration timers)
  // occasionally overlap their act() batches across workers racing for the
  // same machine resources — a real, timing-dependent defect in test
  // isolation, not a slow-test problem `testTimeout` could paper over.
  // `--runInBand` (a single worker, same process, strictly sequential
  // files) was run six times across this investigation and never failed
  // once. Pinning `maxWorkers` to 1 here makes the DEFAULT `npm run
  // test:render` behave exactly like that already-proven-reliable mode,
  // without requiring anyone to remember to append the flag. This trades
  // wall-clock speed (parallel workers) for determinism, which is the
  // explicit, correct tradeoff per this round's requirement that the
  // literal default command pass deterministically. It does not fix the
  // underlying cross-test timer-leak root cause (a larger, separate test-
  // infrastructure hardening effort, out of this pass's authorised scope)
  // — only removes the parallel-worker race that turns it into a flaky
  // failure.
  maxWorkers: 1,
};
