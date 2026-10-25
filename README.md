# LFSR Forge

## What It Is

LFSR Forge is a browser lab for binary Fibonacci linear-feedback shift registers, the Berlekamp–Massey (BM) synthesis algorithm over GF(2), Boolean combining functions, and bounded correlation attacks. Given consecutive known keystream bits, it fits a recurrence, freezes a forecast, checks it against the original generator, and separately compares recovered states with hidden states. Aligned known plaintext and ciphertext from XOR stream encryption can disclose those keystream bits. This is not a ciphertext-only attack, and it is not production crypto — it is a teaching demo with deliberately small registers.

Panel 06 adds a hand-rolled, eSTREAM-vector-checked Trivium: three coupled nonlinear feedback registers, the same existing BM and forecast routines, and an actual public-output key recovery when initialization is deliberately removed.

Panel 07 adds an exact, editable four-input Boolean-function audit. It computes the ANF and degree, all 16 Walsh coefficients, balance, nonlinearity, correlation immunity, resiliency, every fixed-subset restriction, and a complete degree-at-most-two algebraic-immunity search. Three executable counterexamples show why no one of those metrics certifies a stream cipher.

The app is a static Vite/TypeScript frontend. All states and generated bits remain in browser memory; there is no backend, account, storage of session secrets, or telemetry. Hiding a challenge from the interface is an experimental boundary, not protection from a browser owner using developer tools.

## Exhibits

1. **Watch a register:** step a visible five-stage LFSR, then collect one or more bits from a fresh hidden primitive register with supported degree 3–12.
2. **Follow BM:** inspect the immutable per-bit discrepancy trace and the finite-prefix complexity profile. User-entered sequences get analysis without a ground-truth verdict.
3. **Freeze and check:** predict 64 bits from a copied hidden prefix, compare them with the original continuation, then separately confirm the original parameters. Reproducible shared-prefix, early-failure, and early-success examples show why fewer than 2r bits can succeed or fail.
4. **Inspect Geffe:** step its three disclosed registers and selector truth table, then measure the equivalent recurrence from 466 bits.
5. **Recover hidden Geffe states:** scan R1 and R3 agreement on 300 copied output bits, derive R2 constraints, test candidate triples, freeze 64 bits, verify the original continuation, and separately confirm all three original states. A later 466-bit inspection measures complexity without changing the attack's 300-bit budget.

6. **The deployed answer: Trivium:** step the real 288-bit state, compare measured BM profiles and frozen forecasts with panel 03’s LFSR, then remove the 1,152-round initialization and recover the key from public IV/output. The worker solves 66 independent equations over 80 unknown bits and checks all 16,384 remaining candidates. A separate controller comparison confirms the hidden key.
7. **Audit a Boolean combiner:** edit all 16 outputs of a four-input truth table and inspect exact ANF, Walsh, balance, nonlinearity, correlation-immunity, resiliency, restriction, and annihilator results. Then run parity recurrence fitting, an order-two pair scan against a first-order-resilient function, and a single-register scan against a function with algebraic immunity two. Worker inputs remain public-only and hidden states are compared separately.

The Geffe attack's public profile is R1 `1 + D + D^7`, R2 `1 + D^2 + D^11`, and R3 `1 + D + D^3 + D^4 + D^13`, with lengths 7/11/13. The measured periods are 127/2,047/8,191, and the full Geffe linear complexity is 233. The attacker receives a copied output prefix, public profile, and finite search budgets; it receives no hidden states or callable generator.

## When to Use It

Use the lab to learn the difference between fitting a finite prefix, forecasting unseen output, and identifying original state. Use panel 07 to compare Boolean criteria that are often conflated: balance, nonlinearity, correlation immunity, resiliency, algebraic degree, and algebraic immunity. Do **not** use these tiny constructions for real encryption or generalize the result to every nonlinear combiner, SNOW 3G, ZUC, ChaCha20, or Grain. Their structures and attack assumptions differ. Panel 06 runs the same BM check on Trivium, where the measured frozen forecast fails, then shows why that check is not a security proof: the zero-round variant still has no short measured recurrence while its key is recovered.

## Live Demo

[Open LFSR Forge](https://systemslibrarian.github.io/crypto-lab-lfsr-forge/) to run the seven panels in a browser. Deterministic claim fixtures reach cases in which construction or Boolean-function checks pass while an equivalent recurrence or secret register state is still recovered.

## What Can Go Wrong

- A BM fit reproduces supplied bits but can forecast incorrectly on an unseen continuation. `N >= 2L_N` is not, by itself, proof that a hidden generator was identified.
- A 300-bit correlation scan is a finite-budget experiment. No candidate, ties, or a wrong top rank do not certify security. The UI reports actual work, search limits, and checked outcomes.
- Revealed verification bits become observations. New collections retire prior live verdicts; a retry uses the enlarged capture and preserves the earlier run's recorded work.
- The Geffe attack uses known keystream at clock zero and public register structure. It makes no ciphertext-only claim.
- Panel 07's Boolean metrics model independent uniform table inputs. Its LFSR sources are deterministic across time, so the page reports their finite empirical agreement separately from the theoretical Walsh probability.
- The panel-07 scans exhaust only 127 single-register states or 105 state pairs at tiny public degrees. They demonstrate concrete correlations, but are not implementations or performance claims for production fast-correlation attacks.
- Algebraic immunity checks annihilators of `f` and `1+f`; high algebraic immunity does not rule out every low-degree relation used by a fast algebraic attack.

## Real-World Usage

LFSRs and BM appear in coding theory and stream-cipher analysis. BM can synthesize a shortest linear recurrence from observed sequence bits; it does not necessarily reveal an implementation's internal components. The Geffe generator is a historical example showing that nonlinearity and high linear complexity alone do not prevent correlation-based state recovery. See [Massey's 1969 paper](https://crypto.stanford.edu/~mironov/cs359/massey.pdf) and the [*Handbook of Applied Cryptography*, chapter 6 (1996)](https://cacr.uwaterloo.ca/hac/about/chap6.pdf), especially Algorithm 6.30, Table 6.1, and Example 6.50. Panel 07's definitions and caveats are tied to [Siegenthaler (1984)](https://doi.org/10.1109/TIT.1984.1056949), [Xiao and Massey (1988)](https://doi.org/10.1109/18.6037), [Meier and Staffelbach (1989)](https://doi.org/10.1007/BF02252874), [Courtois and Meier (EUROCRYPT 2003)](https://www.iacr.org/archive/eurocrypt2003/26560345/26560345.pdf), [Meier, Pasalic, and Carlet (EUROCRYPT 2004)](https://www.iacr.org/archive/eurocrypt2004/30270469/finaleurocr.pdf), and [Carlet, Dalai, Gupta, and Maitra (2006)](https://doi.org/10.1109/TIT.2006.876253).

## How to Run Locally

Use Node 22 or newer:

```sh
npm ci
npm run dev
```

For the production bundle and browser gate:

```sh
npm test
npm run build
npx playwright install chromium
npm run test:a11y
npm run test:mutations
```

Vite uses the GitHub Pages subpath `/crypto-lab-lfsr-forge/`. The development server prints its local URL.

## Related Demos

- [Drift Key](https://systemslibrarian.github.io/crypto-lab-drift-key/) uses BM on BCH syndromes over an extension field.
- [Air Stream](https://systemslibrarian.github.io/crypto-lab-air-stream/) shows SNOW 3G and ZUC with additional structure; this attack is not claimed against them.
- [Noise to Numbers](https://systemslibrarian.github.io/crypto-lab-noise-to-numbers/) statistically assesses an LFSR sample; this lab makes prediction explicit.
- [Corrupted Oracle](https://systemslibrarian.github.io/crypto-lab-corrupted-oracle/) explores a different attacker-observation model.
- [ChaCha20 Stream](https://systemslibrarian.github.io/crypto-lab-chacha20-stream/) shows a modern stream construction outside this attack scope.
- [OTP Vault](https://systemslibrarian.github.io/crypto-lab-otp-vault/) shows why known keystream and key reuse matter for XOR encryption.

## Build & Verify

The unit suite covers the published HAC Example 6.33 trace, an independent brute-force shortest-recurrence oracle on every binary sequence through eight bits, the primitive period registry, single-register recovery at the 24-bit target, the Geffe truth table and three periods, complexity 233, conditional R2 recovery, finite budgets, and cancellation. The browser suite drives rendered early success/failure, verdict retirement, a 300-to-364-bit retry, the negative-claim fixture, and WCAG 2.1 A/AA scans at desktop and 380px. The original 13 unit tests and six browser claims remain unchanged. Trivium adds 11 unit tests and five independent browser claims. Boolean analysis adds eight unit tests and three independent browser claims; one unit test checks production Walsh and ANF transforms against direct definitions for all 65,536 four-input functions. Accessibility walks include all seven panels and a 320px pass. `npm run test:a11y` runs all Playwright specs, including claims: 32 unit tests and 17 browser tests in total.

Trivium KATs pin three vectors across eSTREAM sets 1, 3 and 5, each with all four
64-byte slices at offsets 0/192/256/448 and the 64-byte XOR digest over the complete
512-byte stream: 15 checks. `src/trivium/vectors.ts` records the exact archived
source revision and both fetched file SHA-256 hashes. The original ECRYPT host
was unavailable; the pinned 2011 archive contains the original `unverified`
run log, and two separately fetched 80/80 copies are byte-identical. No claim
that the original host’s `verified.test-vectors` was obtained is made.

Properties check the real AND taps, state/bit order, the first 66 linear output
relations across 100 random pairs, eight random key recoveries, three full-warm-up
rejections of all candidates, ambiguity and cancellation. The browser tests
contain a separate three-array Trivium and independent BM/forecast implementation;
they check every plotted profile point, frozen predictions, actual worker payload
isolation, separate ground truth, validation, no-op preservation and retirement.
The original LFSR/BM/Geffe modules and benchmark remain unchanged.

`npm run test:mutations` preserves the six original concrete mutations, five
Trivium faults, and six Boolean-analysis faults. Each requires a passing baseline, actual source diff,
successful changed build, named assertion failure, exact restored build and
passing owning test. Served JavaScript and workers are SHA-256 checked so stale
assets cannot count as mutation evidence. The workflow reruns all 17 cases rather than trusting earlier evidence in `docs/mutation-results.json`.

The CI workflow runs unit tests, builds the production bundle, runs the concrete mutation gate, and then runs the browser/accessibility gate before uploading the Pages artifact. It also gates pull requests, groups minor/patch dependency updates, auto-merges only gate-passing Dependabot PRs, and dispatches the same deployment workflow after a token-authored merge. GitHub Pages must use the **GitHub Actions** source.

## Performance

`node scripts/benchmark-browser.mjs` runs eight independently selected state triples from recorded xorshift seed `0x1f5f2026` in Chromium with a 300-bit capture and the shipped search budget. The [recorded run](docs/benchmark-results.json) on headless Chromium 156 / macOS arm64 recovered and correctly predicted all eight. Seven runs reached the 16-pair cap while still finding the exact triple; this is a budget limit, not a failure. Measured scan times were about 364–401 ms in that environment. These eight cases do not establish a universal recovery rate or a runtime speedup over exhaustive key search.

---

*One of the browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
