# Navilo focused test suite

`tsx` is a repository development dependency (see `devDependencies` in `package.json`,
pinned to an exact version). There is still no `jest`/`vitest`/`@testing-library` and no
`npm test` script — these files exist so regression coverage survives in version control
instead of an ephemeral scratchpad, not to imply CI executes them automatically today.
Not all nine files are component-runtime tests; see "What 'behavioural' means" below for
each file's actual evidence class.

## How to run

Dependencies must be installed first through the repository's normal npm installation
process (`npm install`). Each test file is then self-contained and run individually, either
through the local binary or the equivalent `npx` command (both resolve the same pinned,
repository-local `tsx`, not a global or dynamically-downloaded copy):

```bash
./node_modules/.bin/tsx tests/<file>.test.ts
# or
npx tsx tests/<file>.test.ts
```

There is no aggregate "run everything" command. Run each file you need and check its own
`N/M passed.` summary and exit code (`0` = all passed, `1` = at least one failure).

## What "behavioural" means in this suite

Most component files in this app (`.tsx`, and any `.ts` that imports one) transitively
import `react-native`, whose package entry uses Flow syntax that `esbuild`/`tsx` cannot
parse outside Metro's Babel pipeline — confirmed empirically, not assumed. That means React
component files (`GoalDetailSheet.tsx`, `AddWealthItemModal.tsx`, `AddAnythingSheet.tsx`,
etc.) **cannot be imported or executed** by these tests. No render, no simulated tap, no
verification of actual on-screen behaviour is possible here — that remains physical-device
evidence.

What genuinely can be imported and executed for real: any `.ts` module (or the plain,
non-hook, module-level exported functions inside a file that otherwise only fails to import
because of unrelated hook/component code — this repo's `AppStateContext.tsx` is a working
example, see below) whose own import chain never reaches `react-native`. Files in this
suite are labelled per-test with one of:

- **Real import** — the test imports the actual exported production function and asserts on
  its real return value. This is genuine behavioural proof of that function, nothing more.
- **Mirrored logic** — the production function lives inside a file that cannot be imported
  (e.g. co-located with `react-native` imports), so the test contains a verbatim copy of
  that function's body, plus a separate structural assertion confirming the real file still
  contains that exact code. This proves the *mirrored* algorithm is correct; it does **not**
  prove the shipped function is byte-identical to the mirror on its own — the structural
  assertion is what closes that gap, and only for exact wording, not runtime behaviour.
- **Structural** — a regex/string match against source text. Confirms wiring exists; proves
  nothing about runtime behaviour by itself.

Never read a passing "mirrored" or "structural" test as proof that the real React Native
component behaves correctly. Physical-device testing remains the only evidence for that.
