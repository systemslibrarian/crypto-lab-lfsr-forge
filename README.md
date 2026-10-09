# LFSR Forge

## What It Is

LFSR Forge is a browser lab for binary Fibonacci linear-feedback shift registers, the Berlekamp–Massey (BM) synthesis algorithm over GF(2), and a correlation attack on a fixed Geffe generator. Given consecutive known keystream bits, it fits a recurrence, freezes a forecast, checks it against the original generator, and separately compares recovered states with hidden states. Aligned known plaintext and ciphertext from XOR stream encryption can disclose those keystream bits. This is not a ciphertext-only attack, and it is not production crypto — it is a teaching demo with deliberately small registers.

The app is a static Vite/TypeScript frontend. All states and generated bits remain in browser memory; there is no backend, account, storage of session secrets, or telemetry. Hiding a challenge from the interface is an experimental boundary, not protection from a browser owner using developer tools.

## Exhibits

1. **Watch a register:** step a visible five-stage LFSR, then collect one or more bits from a fresh hidden primitive register with supported degree 3–12.
2. **Follow BM:** inspect the immutable per-bit discrepancy trace and the finite-prefix complexity profile. User-entered sequences get analysis without a ground-truth verdict.
3. **Freeze and check:** predict 64 bits from a copied hidden prefix, compare them with the original continuation, then separately confirm the original parameters. Reproducible shared-prefix, early-failure, and early-success examples show why fewer than 2r bits can succeed or fail.
4. **Inspect Geffe:** step its three disclosed registers and selector truth table, then measure the equivalent recurrence from 466 bits.
5. **Recover hidden Geffe states:** scan R1 and R3 agreement on 300 copied output bits, derive R2 constraints, test candidate triples, freeze 64 bits, verify the original continuation, and separately confirm all three original states. A later 466-bit inspection measures complexity without changing the attack's 300-bit budget.

The attack's public profile is R1 `1 + D + D^7`, R2 `1 + D^2 + D^11`, and R3 `1 + D + D^3 + D^4 + D^13`, with lengths 7/11/13. The measured periods are 127/2,047/8,191, and the full Geffe linear complexity is 233. The attacker receives a copied output prefix, public profile, and finite search budgets; it receives no hidden states or callable generator.

## When to Use It

Use the lab to learn the difference between fitting a finite prefix, forecasting unseen output, and identifying original state. Do **not** use these tiny constructions for real encryption or generalize the result to every nonlinear combiner, SNOW 3G, ZUC, ChaCha20, Trivium, or Grain. Their structures and attack assumptions differ.

## Live Demo

[Open LFSR Forge](https://systemslibrarian.github.io/crypto-lab-lfsr-forge/) to run the five panels in a browser. The deterministic claim fixture reaches a case in which the construction checks pass while the secret Geffe state is recovered.

## What Can Go Wrong

- A BM fit reproduces supplied bits but can forecast incorrectly on an unseen continuation. `N >= 2L_N` is not, by itself, proof that a hidden generator was identified.
- A 300-bit correlation scan is a finite-budget experiment. No candidate, ties, or a wrong top rank do not certify security. The UI reports actual work, search limits, and checked outcomes.
- Revealed verification bits become observations. New collections retire prior live verdicts; a retry uses the enlarged capture and preserves the earlier run's recorded work.
- The Geffe attack uses known keystream at clock zero and public register structure. It makes no ciphertext-only claim.

## Real-World Usage

LFSRs and BM appear in coding theory and stream-cipher analysis. BM can synthesize a shortest linear recurrence from observed sequence bits; it does not necessarily reveal an implementation's internal components. The Geffe generator is a historical example showing that nonlinearity and high linear complexity alone do not prevent correlation-based state recovery. See [Massey's 1969 paper](https://crypto.stanford.edu/~mironov/cs359/massey.pdf) and the [*Handbook of Applied Cryptography*, chapter 6 (1996)](https://cacr.uwaterloo.ca/hac/about/chap6.pdf), especially Algorithm 6.30, Table 6.1, and Example 6.50.

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

The unit suite covers the published HAC Example 6.33 trace, an independent brute-force shortest-recurrence oracle on every binary sequence through eight bits, the primitive period registry, single-register recovery at the 24-bit target, the Geffe truth table and three periods, complexity 233, conditional R2 recovery, finite budgets, and cancellation. The browser suite drives rendered early success/failure, verdict retirement, a 300-to-364-bit retry, the negative-claim fixture, and WCAG 2.1 A/AA scans at desktop and 380px. Current local run: **13 unit tests and 8 browser tests passed**. `npm run test:a11y` runs all Playwright specs, including claims.

The CI workflow runs unit tests, builds the production bundle, then runs the browser gate before uploading the Pages artifact. It also gates pull requests, groups minor/patch dependency updates, auto-merges only gate-passing Dependabot PRs, and dispatches the same deployment workflow after a token-authored merge. GitHub Pages must use the **GitHub Actions** source.

## Performance

`node scripts/benchmark-browser.mjs` runs eight independently selected state triples from recorded xorshift seed `0x1f5f2026` in Chromium with a 300-bit capture and the shipped search budget. The [recorded run](docs/benchmark-results.json) on headless Chromium 156 / macOS arm64 recovered and correctly predicted all eight. Seven runs reached the 16-pair cap while still finding the exact triple; this is a budget limit, not a failure. Measured scan times were about 393–403 ms in that environment. These eight cases do not establish a universal recovery rate or a runtime speedup over exhaustive key search.

---

*One of the browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
