// Pass C.5 — TEST-ONLY lifecycle correction (no production file is involved).
//
// A few long-standing rendered suites leave real, component-owned timers
// pending when their last test finishes: the celebration toast's ~3.5 s
// auto-dismiss and React Navigation's 1 s linking timer. Jest tears the module
// registry down first, the timer fires afterwards, the callback touches a lazy
// `react-native` export, and jest-runner reports "You are trying to `import` a
// file after the Jest environment has been torn down" and sets
// process.exitCode = 1 — even though every test in the suite passed.
//
// `installLateTimerDrain()` records every setTimeout a suite schedules and, in
// `afterAll`, lets already-queued React work settle and then cancels the timers
// still pending. Nothing a test observes changes:
// the handle returned is the real one, callbacks run exactly as before, and
// cancellation happens only after the suite's final test has completed. It is
// opt-in per suite so no other suite's behaviour is altered.

export function installLateTimerDrain(): void {
  // Review switch (C.5.1): NAVILO_DISABLE_TIMER_DRAIN=1 turns the helper into a
  // no-op so a suite's need for it can be demonstrated rather than assumed.
  if (process.env.NAVILO_DISABLE_TIMER_DRAIN === '1') return;
  const pending = new Set<ReturnType<typeof setTimeout>>();
  const realSetTimeout = global.setTimeout;
  const realClearTimeout = global.clearTimeout;

  const tracked = ((handler: (...a: unknown[]) => void, ms?: number, ...args: unknown[]) => {
    const handle: ReturnType<typeof setTimeout> = realSetTimeout(() => {
      pending.delete(handle);
      handler(...args);
    }, ms);
    pending.add(handle);
    return handle;
  }) as unknown as typeof setTimeout;
  Object.assign(tracked, realSetTimeout); // keep __promisify__ and friends
  global.setTimeout = tracked;

  afterAll(async () => {
    // React's scheduler queues renders and passive effects with setImmediate. Let
    // work that is ALREADY queued run while the environment is still alive…
    const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
    for (let i = 0; i < 3; i++) await settle();
    // …then cancel the component timers that would otherwise outlive the suite.
    for (const handle of pending) realClearTimeout(handle);
    pending.clear();
    global.setTimeout = realSetTimeout;
    await settle();
  });
}
