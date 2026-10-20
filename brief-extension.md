# Extension brief — `crypto-lab-lfsr-forge`

**2026-10-20. Extension to a live lab; no new repository.** Written against
`crypto-lab-lfsr-forge` at `f3ce77fea93a` and `audits/_MASTER-TEMPLATE.md` (catalog
`f48d9d2f2f06`). Template §5: "Extend, never restructure." Source of the gap:
Katz–Lindell, *Introduction to Modern Cryptography*, 3rd ed., §7.1.1–7.1.3 (LFSRs,
adding nonlinearity, Trivium).

**Verdict: extension — a sixth panel, "06 · The deployed answer: Trivium".**

## What the lab has now

Read at `f3ce77fea93a`:

- Hand-rolled binary Fibonacci LFSRs (`src/lfsr/lfsr.ts`), Berlekamp–Massey with a full
  per-bit trace (`berlekampMasseyTrace`, `src/lfsr/bm.ts:29`), `forecast`
  (`src/lfsr/bm.ts:65`), a Geffe combiner (`src/geffe/geffe.ts`) and a correlation attack
  in a worker (`src/geffe/correlation.ts`, `src/geffe/attack.worker.ts`).
- Five `section.panel`s rendered from `src/main.ts:140–144` (`#panel-register`,
  `#panel-bm`, `#panel-predict`, `#panel-geffe`, `#panel-attack`) and an afterword
  (`:145`). Verdicts are `data-verdict` strings (e.g. `ONE TRIPLE WITHIN SEARCH BUDGET`,
  `GEFFE STATES CONFIRMED`); claims are `data-claim` (e.g. `data-claim="negative"`).
- `e2e/gate.ts:25` asserts `section.panel` count **5**.
- `e2e/claims.spec.ts:54` is the existing §4.1d test: *"This Geffe generator's
  nonlinearity and high linear complexity do not prevent recovery of its secret state."*
- `scripts/mutation-check.mjs` runs concrete-patch mutations (six cases) and writes
  `docs/mutation-results.json`; `npm run test:mutations`.
- **README line 21 names Trivium as out of scope**: *"Do not … generalize the result to
  every nonlinear combiner, SNOW 3G, ZUC, ChaCha20, Trivium, or Grain."* A grep of the
  sibling clones on 2026-10-20 for `trivium` (case-insensitive, all `src/` and `README`)
  matched only that line. Re-run `grep -rli trivium ../crypto-lab-*/src ../crypto-lab-*/README.md`
  before building and report what you find.

## What to add

Panel 06, three cards, in this order:

1. **Three registers, three AND gates.** A hand-rolled Trivium drawn as its three coupled
   shift registers A/B/C of lengths 93/84/111 (288 state bits), with the three AND terms
   (`s91·s92`, `s175·s176`, `s286·s287`) highlighted as the only nonlinear parts. A
   stepper clocks the real state one tick at a time and shows `t1`, `t2`, `t3` and the
   output bit. Key and IV are 80 bits each.
2. **Berlekamp–Massey meets Trivium (the headline).** Feed `N` keystream bits
   (selectable, e.g. 128 / 256 / 512 / 1024) from a fresh key and IV into the lab's
   **existing** `berlekampMasseyTrace`, and plot the linear-complexity profile beside the
   one panel 03 drew for an LFSR. The LFSR's profile flattens at its degree `L` and its
   frozen forecast verifies. Trivium's profile tracks `N/2` all the way; the forecast
   `forecast()` makes from that fit is frozen, then checked against the real continuation,
   and fails. Same algorithm, same check, opposite outcome — the nonlinearity is the
   difference.
3. **Why the warm-up exists (break-it-yourself + negative claim).** An "initialization
   rounds" control: `1152` (the specification, default, locked as "Trivium") and `0`
   (marked broken). With 0 rounds, the first 66 output bits are each the XOR of six
   **original** state bits — one or two of them key bits (register A holds the key in
   s1–s80 and zeros in s81–s93), the rest IV bits or constants — so the
   page sets up those 66 linear equations, solves them, brute-forces the remaining
   2¹⁴ key candidates against later output, and recovers the key. Panel 06 then runs the
   **same** Berlekamp–Massey check on the 0-round output: it still reports no short
   recurrence. Verdict: **"NO SHORT RECURRENCE — AND KEY RECOVERED"**.

Prose only, beside card 3, scoped exactly: reduced-initialization Trivium has been
attacked far further — Dinur and Shamir's cube attack recovers the key of the 672-, 735-
and 767-round variants in 2¹⁹, 2³⁰ and 2⁴⁵ bit operations (ePrint 2008/385; EUROCRYPT
2009). The full cipher uses 4 × 288 = 1152 rounds; Katz–Lindell's 3rd edition (2021) says
no attack better than exhaustive search was known against it. Do not execute a cube attack
and do not claim anything beyond these numbers.

**Plain-language intro (no math):** The registers in panels 01–05 only ever XOR bits
together, which is why a short algorithm can rebuild them. Trivium, a cipher standardised
for small hardware, adds three AND gates. This panel runs the same rebuilding algorithm on
it and shows where it stops working — and why the 1,152 warm-up steps are not decoration.

**What I measured while writing this (re-measure with your KAT-verified implementation;
do not cite these as results):** a spec-transcribed Trivium gave BM linear complexity 512–513
on 1024 output bits at 0, 288 and 1152 initialization rounds alike; at 0 rounds the first
66 output bits were exactly the predicted XORs of original state bits, and the 66
equations had rank 66 over the 80 key bits, leaving 2¹⁴ candidates.

## Why it belongs here and not in a new lab

The lab's thesis is *fitting a prefix vs forecasting vs recovering state*, and its own
README draws the boundary at Trivium. Panel 06 crosses that boundary with the lab's own
tools (BM, `forecast`, frozen predictions, separate state comparison) instead of new ones.

## SECURITY / CORRECTNESS INVARIANTS

1. Trivium is hand-rolled in one inspectable file and passes the published eSTREAM vectors
   (below) before any panel uses it.
2. The 1152-round setting is the default and the only one labelled "Trivium". The 0-round
   setting is visibly marked broken whenever selected, and its verdicts never say "Trivium"
   without "0 initialization rounds" beside it.
3. The attacker routine in card 3 receives the IV, the public spec and observed output
   bits only — never the key. Ground truth is compared separately, as panel 05 already
   does for Geffe (reuse that separation, including the worker boundary).
4. A BM result on Trivium output is reported as a measured profile on `N` bits, never as
   "Trivium's linear complexity".
5. Existing panels 01–05, their verdicts, budgets and fixtures are unchanged.

## ARCHITECTURE

- `src/trivium/trivium.ts` — `loadState(key, iv)`, `clock(state)` returning
  `{ z, t1, t2, t3, next }` for the stepper, `keystreamBits(key, iv, n, initRounds = 1152)`,
  plus byte packing in the eSTREAM convention (below).
- `src/trivium/vectors.ts` — the pinned eSTREAM vectors, with a header naming the source
  file, its revision, and the SHA-256 of the file as fetched (pattern:
  `crypto-lab-wep-crack/src/rc4/vectors.ts`).
- `src/trivium/zero-round.ts` — builds the 66×80 GF(2) system from the IV and observed bits,
  solves it, enumerates the free variables, and confirms each candidate against later
  output. Runs in a worker; reuse panel 05's worker/cancel pattern.
- `src/trivium/trivium.test.ts`.
- `// [extension] point`s: (a) in `keystreamBits` for a Grain-128AEAD comparison;
  (b) in `zero-round.ts` for a cube-attack exhibit on small round counts.

## UI

Card 1: key and IV fields (20 hex digits each, defaults shown), "Clock one tick" and
"Run initialization (1152)" buttons; three register strips with the AND-gate taps marked.
Card 2: `N` selector, "Run BM on Trivium" and "Run BM on panel 03's LFSR" buttons, one shared
profile chart (both series, labelled; not colour alone), "Freeze forecast" → "Reveal
continuation". Card 3: init-rounds radio (1152 / 0), "Observe output", "Recover key",
"Compare with hidden key", and the negative-claim sentence in the result area. Stacks
below 640px; live regions `role="status"`.

## VISUAL SEMANTICS

- The Trivium forecast failing reads as **HELD** (the generator resisted this check) — but
  card 3 exists so the learner cannot leave thinking HELD means secure.
- The 0-round key recovery reads **ALARM**, beside a BM verdict that reads "no short
  recurrence" — both visible at once. That pairing is the lesson; do not soften either.
- Profile chart: the LFSR series and Trivium series differ by line style and label as well
  as colour; the `N/2` reference line is labelled.

## EDGE CASES

| Input | Behaviour |
|---|---|
| key/IV not 20 hex digits | refuse, name the length; no state loaded |
| `N` outside the offered set | not possible from the UI; reject in code with a message |
| 0-round recovery finds no candidate or more than one | report the count found and stop; never pick one silently |
| switching init rounds or key after a verdict | retire every card-3 verdict and say so |
| BM run on panel 03's LFSR before panel 03 has a capture | generate a fresh disclosed LFSR for the comparison and label it as such |

## Tests

**KATs — eSTREAM Trivium test vectors.** The primary file is the eSTREAM submission's
test-vector file in the ECRYPT svn
(`http://www.ecrypt.eu.org/stream/svn/viewcvs.cgi/ecrypt/trunk/submissions/trivium/` —
an `unverified.test-vectors` log at rev 210 is indexed there; take `verified.test-vectors`
if present). **I could not fetch it from here** (the site refuses automated fetches), so:
obtain it, commit nothing but the vectors you transcribe, record the file's revision and
SHA-256 in `vectors.ts`, and pin **every slice the file gives for at least three vectors
across two sets — `stream[0..63]`, `stream[192..255]`, `stream[256..319]`,
`stream[448..511]` and the 512-byte `xor-digest`** — so a vector reaches far past the first
block of output. Byte/bit order is the classic trap: independent implementations report the
eSTREAM convention as key/IV bit `K1` = most significant bit of the **last** byte and `K80`
= least significant bit of the **first** byte, with keystream bits packed LSB-first. Two
values from secondary sources, which a spec-transcribed implementation using that
convention reproduced here, are useful as a first smoke test only: key
`80000000000000000000`, IV all-zero → first 16 bytes `38eb86ff730d7a9caf8df13a4420540d`;
key `0053a6f94c9ff24598eb`, IV `0d74db42a91077de45ac` → `f4cd954a717f26a7d6930830c4e7cf08`.
`[UNVERIFIED against the primary file — replace with the pinned values]`.

Unit properties: 1152 is the default; state length 288; the three AND taps are exactly
`(91,92)`, `(175,176)`, `(286,287)` (a test that reads them from the module, not a copy);
at 0 rounds, output bit `t` for `t < 66` equals the XOR of original positions
`66−t, 93−t, 162−t, 177−t, 243−t, 288−t`; the zero-round solver recovers a random key in
repeated trials; on 1152-round output the 66 equations still have solutions (rank 66 < 80
unknowns), but every one of the 2¹⁴ candidates fails the check against later output, and
the page reports zero consistent keys rather than a wrong one.

**`e2e/claims.spec.ts` additions** (independent re-derivation — a second, minimal Trivium
written inside the test file from the specification, not imported from `src/`):
- the stepper's displayed output bit equals the test's own Trivium at that tick;
- card 2's plotted final `L` for Trivium equals BM computed in the test on the displayed
  bits; the LFSR series' final `L` equals its degree;
- the frozen Trivium forecast differs from the revealed continuation, and the verdict
  says so; the LFSR forecast matches;
- card 3: the recovered key equals the hidden key (compared by the test via the ground-truth
  surface the lab already uses for Geffe), and the BM verdict in the same state reports no
  short recurrence;
- retirement on key/IV/rounds change.

**§4.1c** — add concrete patches to `scripts/mutation-check.mjs` (its existing format), each
owned by a named test:
1. Replace one AND term with XOR in `clock` → KAT and stepper tests fail.
2. Change initialization from 1152 to 1151 → KAT test fails.
3. Make the zero-round solver read the hidden key → the isolation assertion fails (mirror
   panel 05's "only a copied prefix reaches the worker" guarantee).
4. Hard-wire card 2's Trivium verdict to "FORECAST VERIFIED" → the forecast test fails.

**§4.1d negative claim (panel 06):**
> *"A keystream that defeats Berlekamp–Massey is not thereby secure: with its 1,152 warm-up
> rounds removed, this Trivium still shows no short recurrence while its key is read off
> the first output bits."*

Fixture: init rounds = 0, a reproducible key/IV. Assert (1) reached via the UI, (2) every
check the page performs reports its success state — KATs pass for the 1152 setting, BM
reports no short recurrence on the 0-round output — and (3) the sentence above is on screen
in that state, next to **"NO SHORT RECURRENCE — AND KEY RECOVERED"**.

**Structural gate:** `e2e/gate.ts:25` → 6 panels.

## README and card follow-up

- README line 21: remove Trivium from the "do not generalize" list and add a sentence that
  panel 06 runs the same BM check on Trivium, where it fails, and shows why the check is
  not a security proof. Keep SNOW 3G, ZUC, ChaCha20 and Grain in the list.
- "What It Is" and "Exhibits": add item 6. "Build & Verify": name the eSTREAM vector source
  and count. "Related Demos": unchanged except as needed.
- Afterword (`src/main.ts:145`): add one sentence pointing to panel 06.
- Catalog handoff (do not edit `../crypto-lab`): chips may gain `Trivium` (implemented).

## Do not touch

The LFSR, BM and Geffe modules' behaviour, the five existing panels, their budgets and
fixtures, `docs/benchmark-results.json`, the existing mutation cases, header, theme pin,
footer.

## Sources

- Katz & Lindell, *Introduction to Modern Cryptography*, 3rd ed., CRC Press, 2021 (ISBN
  9780815354369): §7.1.1–7.1.3 (the "no attack better than exhaustive search" sentence is
  in §7.1.3).
- C. De Cannière, B. Preneel, "Trivium: Specifications" (eSTREAM submission) — state
  layout, taps, AND gates, key into s1–s80, IV into s94–s173, s286–s288 = 1,
  4 × 288 = 1152 initialization rounds. Verified at https://cr.yp.to/streamciphers/trivium/desc.pdf
  (the document states no date, report number, bit ordering or test vectors).
- eSTREAM portfolio (revised 2008): Trivium in Profile 2 (hardware). Verified at
  https://competitions.cr.yp.to/estream.html
- ISO/IEC 29192-3:2012, *Lightweight cryptography — Part 3: Stream ciphers* — specifies
  Enocoro and Trivium; last reviewed and confirmed 2024. Verified at
  https://www.iso.org/standard/56426.html
- I. Dinur, A. Shamir, "Cube Attacks on Tweakable Black Box Polynomials", Cryptology ePrint
  Archive 2008/385 (shorter version at EUROCRYPT 2009) — 672/735/767 rounds in
  2¹⁹/2³⁰/2⁴⁵ bit operations. Verified at https://eprint.iacr.org/2008/385
- Bit-order convention (secondary; confirm against the primary vector file):
  https://github.com/mdhender/trivium (README) and https://laoutaris.cc/blog/trivium_guide/
