# LFSR Forge

## What It Is

LFSR Forge is a browser lab for binary Fibonacci linear-feedback shift registers, the Berlekamp–Massey (BM) synthesis algorithm over GF(2), Boolean combining functions, and bounded correlation attacks. Given consecutive known keystream bits, it fits a recurrence, freezes a forecast, checks it against the original generator, and separately compares recovered states with hidden states. Aligned known plaintext and ciphertext from XOR stream encryption can disclose those keystream bits. This is not a ciphertext-only attack, and it is not production crypto — it is a teaching demo with deliberately small registers.

Panel 06 adds a hand-rolled, eSTREAM-vector-checked Trivium: three coupled nonlinear feedback registers, the same existing BM and forecast routines, and an actual public-output key recovery when initialization is deliberately removed.

Panel 07 adds an exact, editable four-input Boolean-function audit. It computes the ANF and degree, all 16 Walsh coefficients, balance, nonlinearity, correlation immunity, resiliency, every fixed-subset restriction, and a complete degree-at-most-two algebraic-immunity search. Three executable counterexamples show why no one of those metrics certifies a stream cipher.

Panel 08 executes a cube sum and superpoly recovery on a separate three-secret/four-public toy oracle over GF(2). It exhausts four cube faces during preprocessing, admits three affine maxterms to a rank-three solve, freezes a three-bit candidate, and checks four disjoint held-out observations before a separate controller comparison. The oracle executes no Trivium state or round and makes no claim against full Trivium.

Panel 09 is a separately labeled historical A5/1 lesson, tied to the reverse-engineered Briceno–Goldberg–Wagner (BGW) definition rather than presented as a modern design. It reproduces the published Kc/COUNT test vector and two consecutive 114-bit bursts, with derived post-key, post-COUNT, and post-100 register checkpoints, then asks the learner to predict a pre-clock majority decision beside a counterfactual regular step. Its second exercise receives an extraordinarily privileged leak of 52 exact bits from one post-100 keystream-start state and enumerates the other 12 state bits; this bounded adaptation is neither a published A5/1 attack nor session-key recovery.

The app is a static Vite/TypeScript frontend. All states and generated bits remain in browser memory; there is no backend, account, storage of session secrets, or telemetry. Hiding a challenge from the interface is an experimental boundary, not protection from a browser owner using developer tools.

## Exhibits

1. **Watch a register:** step a visible five-stage LFSR, then collect one or more bits from a fresh hidden primitive register with supported degree 3–12.
2. **Follow BM:** inspect the immutable per-bit discrepancy trace and the finite-prefix complexity profile. User-entered sequences get analysis without a ground-truth verdict.
3. **Freeze and check:** predict 64 bits from a copied hidden prefix, compare them with the original continuation, then separately confirm the original parameters. Reproducible shared-prefix, early-failure, and early-success examples show why fewer than 2r bits can succeed or fail.
4. **Inspect Geffe:** step its three disclosed registers and selector truth table, then measure the equivalent recurrence from 466 bits.
5. **Recover hidden Geffe states:** scan R1 and R3 agreement on 300 copied output bits, derive R2 constraints, test candidate triples, freeze 64 bits, verify the original continuation, and separately confirm all three original states. A later 466-bit inspection measures complexity without changing the attack's 300-bit budget.

6. **The deployed answer: Trivium:** step the real 288-bit state, compare measured BM profiles and frozen forecasts with panel 03’s LFSR, then remove the 1,152-round initialization and recover the key from public IV/output. The worker solves 66 independent equations over 80 unknown bits and checks all 16,384 remaining candidates. A separate controller comparison confirms the hidden key.
7. **Audit a Boolean combiner:** edit all 16 outputs of a four-input truth table and inspect exact ANF, Walsh, balance, nonlinearity, correlation-immunity, resiliency, restriction, and annihilator results. Then run parity recurrence fitting, an order-two pair scan against a first-order-resilient function, and a single-register scan against a function with algebraic immunity two. Worker inputs remain public-only and hidden states are compared separately.
8. **Recover a superpoly:** evaluate every assignment of four two-variable public cubes against an explicit degree-four oracle, recover their superpolys by a Möbius transform, and reject the valid C34 cube from the affine solve because its superpoly is quadratic. Three independent equations filter 8 → 4 → 2 → 1 toy-key candidates; four held-out public rows and a controller comparison then confirm the frozen candidate. Dropping C24 remains ambiguous, while flipping C13's sum produces a wrong candidate that the held-outs reject.
9. **Clock historical A5/1:** zero three distinct 19/22/23-bit registers, load the first displayed Kc byte first with each byte least-significant bit first, load the 22-bit COUNT least-significant bit first, and perform 100 output-disabled majority clocks. Predict which registers advance from their pre-clock control bits, execute clock-before-output, and compare a copied counterfactual regular step. Then enumerate all 4,096 completions of a 52-disclosed/12-hidden post-warm-up state against 32 aligned known-keystream bits, freeze the survivor, test 32 disjoint held-out bits, and compare the controller state separately. Executable ambiguity, wrong-clock-model, and corrupted-observation cases stop or reject rather than overclaim.

The Geffe attack's public profile is R1 `1 + D + D^7`, R2 `1 + D^2 + D^11`, and R3 `1 + D + D^3 + D^4 + D^13`, with lengths 7/11/13. The measured periods are 127/2,047/8,191, and the full Geffe linear complexity is 233. The attacker receives a copied output prefix, public profile, and finite search budgets; it receives no hidden states or callable generator.

## When to Use It

Use the lab to learn the difference between fitting a finite prefix, forecasting unseen output, and identifying original state. Use panel 07 to compare Boolean criteria that are often conflated: balance, nonlinearity, correlation immunity, resiliency, algebraic degree, and algebraic immunity. Use panel 08 to distinguish public cube enumeration, offline superpoly recovery, online affine solving, and held-out validation. Use panel 09 to trace how irregular majority clocking changes a state-inference model and why fresh evidence must verify a provisional completion. Do **not** use these tiny constructions for real encryption or generalize the result to every nonlinear combiner, SNOW 3G, ZUC, ChaCha20, Grain, full Trivium, or modern cellular encryption. Their structures and attack assumptions differ. Panel 06 runs the same BM check on Trivium, where the measured frozen forecast fails, then shows why that check is not a security proof: the zero-round variant still has no short measured recurrence while its key is recovered.

## Live Demo

[Open LFSR Forge](https://systemslibrarian.github.io/crypto-lab-lfsr-forge/) to run the nine panels in a browser. Deterministic claim fixtures reach cases in which construction or Boolean-function checks pass while an equivalent recurrence or secret register state is still recovered, cases in which incomplete or corrupted cube evidence must not produce a recovery verdict, and the bounded historical A5/1 state-completion outcomes described above.

## What Can Go Wrong

- A BM fit reproduces supplied bits but can forecast incorrectly on an unseen continuation. `N >= 2L_N` is not, by itself, proof that a hidden generator was identified.
- A 300-bit correlation scan is a finite-budget experiment. No candidate, ties, or a wrong top rank do not certify security. The UI reports actual work, search limits, and checked outcomes.
- Revealed verification bits become observations. New collections retire prior live verdicts; a retry uses the enlarged capture and preserves the earlier run's recorded work.
- The Geffe attack uses known keystream at clock zero and public register structure. It makes no ciphertext-only claim.
- Panel 07's Boolean metrics model independent uniform table inputs. Its LFSR sources are deterministic across time, so the page reports their finite empirical agreement separately from the theoretical Walsh probability.
- The panel-07 scans exhaust only 127 single-register states or 105 state pairs at tiny public degrees. They demonstrate concrete correlations, but are not implementations or performance claims for production fast-correlation attacks.
- Algebraic immunity checks annihilators of `f` and `1+f`; high algebraic immunity does not rule out every low-degree relation used by a fast algebraic attack.
- A public-input cube is valid even when its superpoly is nonlinear. Panel 08's C34 cube is excluded only from this bounded affine solve; nonlinear-superpoly techniques are outside the lesson.
- A full-rank system can encode a corrupted observation. The flipped-C13 case recovers the wrong candidate `000`, which is why the lesson freezes the candidate and checks fresh, disjoint public inputs before comparing ground truth.
- Panel 08's 128 raw preprocessing calls and 16 raw online calls are exact counts for its tiny oracle, not Trivium attack costs. It executes neither the 1,152-round cipher nor the reduced 672-, 735-, and 767-round variants analyzed in the cited paper.
- Panel 09 assumes an already aligned 32-bit known keystream and an exact leak of 52 post-warm-up state bits. The remaining 4,096 raw state completions are not proved reachable from Kc initialization, and the experiment neither recovers Kc nor implements a published A5/1 attack.
- Sixteen observed bits leave 11 completions in the fixed A5/1 fixture. Clocking every register instead leaves none after two bits, which rejects that counterfactual model for this fixture; it does not show that irregular clocking is secure.
- Flipping one-based observed bit 29 selects the wrong completion 1409. Its frozen continuation disagrees with the controller in 11 of 32 positions, so no recovery verdict is issued.
- The A5/1 worker receives only the masked 52-bit disclosure, copied observations, clock model, and run identifier. Cancellation, changed evidence, same-scenario restarts, malformed replies, and pagehide retire results before they can become verdicts.

## Real-World Usage

LFSRs and BM appear in coding theory and stream-cipher analysis. BM can synthesize a shortest linear recurrence from observed sequence bits; it does not necessarily reveal an implementation's internal components. The Geffe generator is a historical example showing that nonlinearity and high linear complexity alone do not prevent correlation-based state recovery. See [Massey's 1969 paper](https://crypto.stanford.edu/~mironov/cs359/massey.pdf) and the [*Handbook of Applied Cryptography*, chapter 6 (1996)](https://cacr.uwaterloo.ca/hac/about/chap6.pdf), especially Algorithm 6.30, Table 6.1, and Example 6.50. Panel 07's definitions and caveats are tied to [Siegenthaler (1984)](https://doi.org/10.1109/TIT.1984.1056949), [Xiao and Massey (1988)](https://doi.org/10.1109/18.6037), [Meier and Staffelbach (1989)](https://doi.org/10.1007/BF02252874), [Courtois and Meier (EUROCRYPT 2003)](https://www.iacr.org/archive/eurocrypt2003/26560345/26560345.pdf), [Meier, Pasalic, and Carlet (EUROCRYPT 2004)](https://www.iacr.org/archive/eurocrypt2004/30270469/finaleurocr.pdf), and [Carlet, Dalai, Gupta, and Maitra (2006)](https://doi.org/10.1109/TIT.2006.876253). Panel 08 follows Dinur and Shamir's definitions of cubes, superpolys, maxterms, preprocessing, and online recovery in [*Cube Attacks on Tweakable Black Box Polynomials* (ePrint 2008/385)](https://eprint.iacr.org/2008/385). Its visible note records an apparent inconsistency rather than silently copying the paper's introductory fixture: direct evaluation of the printed polynomial adds a constant 1 to the stated `v3 = 0` face sum. The real-cipher boundary follows the [original Trivium specification](https://cr.yp.to/streamciphers/trivium/desc.pdf). Panel 09 pins the [BGW pedagogical C source](https://github.com/NSAPlayset/TWILIGHTVEGETABLE/blob/02f25aeade71a9addc06e8f9678742e04d25fd59/A5.1/C/A5.1.c) at commit `02f25aeade71a9addc06e8f9678742e04d25fd59` and records fetched-file SHA-256 `72488fd7e9512e40a246c2b137ef49b4fc60b35a69218bc6bc47f88da3ab1eb1`. [Biryukov, Shamir, and Wagner (FSE 2000)](https://doi.org/10.1007/3-540-44706-7_1) supplies the historical register/setup terminology and real-attack boundary. [ETSI TS 143 020 / 3GPP TS 43.020, Annex C](https://www.etsi.org/deliver/etsi_ts/143000_143099/143020/11.05.00_60/ts_143020v110500p.pdf) documents the external 64-bit Kc, 22-bit COUNT, and two 114-bit blocks while referring the internal algorithm to a GSM Association-managed specification; accordingly, this lab labels its internal definition reverse-engineered rather than public-standard text.

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

The unit suite covers the published HAC Example 6.33 trace, an independent brute-force shortest-recurrence oracle on every binary sequence through eight bits, the primitive period registry, single-register recovery at the 24-bit target, the Geffe truth table and three periods, complexity 233, conditional R2 recovery, finite budgets, and cancellation. The browser suite drives rendered early success/failure, verdict retirement, a 300-to-364-bit retry, the negative-claim fixture, and WCAG 2.1 A/AA scans at desktop and 380px. The original 13 unit tests and six browser claims remain unchanged. Trivium adds 11 unit tests and five independent browser claims. Boolean analysis adds eight unit tests and three independent browser claims; one unit test checks production Walsh and ANF transforms against direct definitions for all 65,536 four-input functions. Cube analysis adds six unit tests and two independent browser claims. Its references separately compute all 128 oracle inputs, cube sums, superpoly ANFs, survive/cancel/zero term partitions, ranks, candidate progression, held-out fingerprints, and malformed-input failures. Historical A5/1 adds nine unit tests and four independent browser claims covering the BGW vector, derived setup checkpoints, register presentation, clock-before-output interaction, masked worker boundary, exact candidate progression, held-out/controller verification, three failure cases, and result retirement. Accessibility walks include all nine panels at 1,280px and 380px plus a 320px extension pass, expanding reached A5/1 success and failure states at each width. `npm run test:a11y` runs all Playwright specs, including claims: 47 unit tests and 23 browser tests in total.

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
Trivium faults, six Boolean-analysis faults, six cube-analysis faults, and ten historical A5/1 faults. Each requires a passing baseline, actual source diff,
successful changed build, named assertion failure, exact restored build and
passing owning test. Served JavaScript and workers are SHA-256 checked so stale
assets cannot count as mutation evidence. The workflow reruns all 33 cases rather than trusting earlier evidence in `docs/mutation-results.json`.

The CI workflow runs unit tests, builds the production bundle, runs the concrete mutation gate, and then runs the browser/accessibility gate before uploading the Pages artifact. It also gates pull requests, groups minor/patch dependency updates, auto-merges only gate-passing Dependabot PRs, and dispatches the same deployment workflow after a token-authored merge. GitHub Pages must use the **GitHub Actions** source.

## Performance

`node scripts/benchmark-browser.mjs` runs eight independently selected state triples from recorded xorshift seed `0x1f5f2026` in Chromium with a 300-bit capture and the shipped search budget. The [recorded run](docs/benchmark-results.json) on headless Chromium 156 / macOS arm64 recovered and correctly predicted all eight. Seven runs reached the 16-pair cap while still finding the exact triple; this is a budget limit, not a failure. Measured scan times were about 364–401 ms in that environment. These eight cases do not establish a universal recovery rate or a runtime speedup over exhaustive key search.

---

*One of the browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
