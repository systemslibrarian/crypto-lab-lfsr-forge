# LFSR Forge — the deployed answer: Trivium

Brief: `brief-extension.md`. Slug: `crypto-lab-lfsr-forge`.
Starting main: `f3ce77fea93a230740f44f39125f4a2ec2613ac6` (no drift).
Pages: https://systemslibrarian.github.io/crypto-lab-lfsr-forge/

## Delivered

A sixth panel has three cards: an actual 288-bit Trivium state stepper with
three marked nonlinear feedback pairs; measured BM profiles and frozen
forecasts using the original BM/forecast functions; and a worker that recovers
the key when the warm-up is deliberately removed. Only the specified 1,152
initialization setting is called Trivium without a broken/zero-round qualifier.

The comparison uses panel 03's original generator when it has a capture,
explicitly collecting the selected N-bit comparison prefix. Otherwise it
generates and discloses a fresh seven-stage LFSR. All profile points, fitted
lengths, predictions and continuations are computed. The two lines have
different styles and labels; N/2 is a labelled reference, not a security bound.
The measured full-warm-up fixture fits L_1024 = 512 and its frozen continuation
fails; removing warm-up fits L_1024 = 513 yet the separate attack recovers its key.
“Short” is explicitly at most 12 stages, the original challenge degree bound.

The attack worker receives only copied public IV and output bits. It builds
and displays the 66 equations, performs GF(2) elimination (rank 66), enumerates
all 16,384 free-variable assignments and checks each against the entire observed
prefix. Ground truth is compared separately in the controller. Zero candidates
and multiple candidates stop without silently choosing a key. Work yields every
256 candidates; cancellation, edits and page exit invalidate stale responses.
No-op input events preserve results. Input lengths and allowed N values are
validated; malformed fields leave no state loaded.

The required negative fixture is reached through observation → recovery →
comparison. Published full-round checks pass, the measured zero-round prefix has
no short recurrence, and the recovered key and negative sentence are visible
together. Forecast failure is HELD; key recovery is ALARM, with words as well
as color. The original five panels, crypto behavior, budgets, fixtures,
benchmark, header, theme pin, footer and CI workflow are preserved.

## Sources and scoped corrections

The sibling source/README search matched only this repo's previous README
exclusion. No existing Trivium implementation was found in available clones.
The intro corrects the brief's overly broad “only XOR” sentence: Geffe already
has a nonlinear selector; Trivium adds nonlinear feedback inside the registers.

The original ECRYPT host could not be fetched. Two separately fetched archived
80/80 vector files were byte-identical. The entire 118,380-byte section also
matches the section at byte 227,299 of the pinned 345,679-byte original-format
`trivium-unverified.test-vectors` log. `vectors.ts` records archival commit
`2a5b018aa71694c5021f41e469234c3c5adb8784`, exact URLs, sizes and both SHA-256
hashes. It does not claim to have obtained the unavailable original host's
`verified.test-vectors` or independently verified its SVN revision number.
Only transcribed vectors are committed. Sets 1/3/5 include a single key bit,
nonuniform key bytes and nonzero IV; all four 64-byte slices and each complete
512-byte stream's 64-byte XOR digest are checked (15 checks).

The primary specification's cached §§2.1–2.2 text was read for state loading,
feedback and warm-up (direct PDF fetch returned 502). The vector pins confirm
the byte/bit convention. The IACR 2008/385 abstract and IEC standard page were
checked directly. Cube attacks and their stated 672/735/767-round work factors
are prose only. Katz–Lindell's no-better-than-exhaustive statement is explicitly
historical (2021), sourced to the supplied checked brief, not a current claim.

## Verification

- 24 unit tests passed (13 original, 11 new): all published slices/digests,
  actual AND taps, 100 random first-66-bit identities, eight random full key
  recoveries, three full-warm-up searches rejecting every candidate, ambiguity,
  cancellation, validation and measured BM behavior.
- §4.1a: boot adds only panel/card counts. Existing structural assertions remain.
- §4.1b: all 11 browser claims passed. Five new claims independently implement
  a three-array Trivium and BM/forecast; every plotted point for N = 128/256/512/
  1024 is checked. Payload isolation, separate hidden-key comparison, retirement,
  no-op events, zero/multiple candidates and cancellation are covered.
- §4.1c: all 11 concrete mutations were killed, including the unchanged six
  original cases and five additions. `docs/mutation-results.json` records source
  diffs, changed successful builds, named zero-retry assertion failures, restored
  hashes and passing owning tests. Served JS and worker hashes guard against
  stale-artifact evidence. The hidden-key mutation fails the payload-isolation
  assertion before waiting for an attack result.
- §4.1d: the actual zero-round key is recovered while published KATs and the
  scoped BM check pass. Removing the negative sentence fails its owning test.
- Three accessibility tests passed: complete six-panel desktop/380px walks and
  a 320px extension walk. The final enlarged chart labels also passed the 320px
  gate. Register, profile, recovery, grayscale and deuteranopia views were
  inspected; no baseline exemption was added.
- Local Chromium 153.0.8010.0 used an ignored config because the pinned browser
  download was unavailable. CI configuration remains unchanged.

## Catalog handoff — no shared edits

Suggested card sentence: “Compare LFSR and Trivium forecasts, then recover a
zero-warm-up key even while Berlekamp–Massey finds no short recurrence.”
Add chip `Trivium`; retain the existing chips.
Implemented call sites: `src/trivium/trivium.ts` state/clock/keystream;
`vectors.ts` published checks; `zero-round.ts` elimination and candidate checks;
`attack.worker.ts` public-observation boundary; `panel.ts` three interactive cards.
Reuses the original `src/lfsr/bm.ts` and `forecast` without changing them.
Prose only: cube attacks, Grain-128AEAD comparison seam and historical security.
Concept deepened: **4. Confusion, diffusion, and cipher structure**.

Final main SHA and exact served-byte proof are recorded after publication.
The fleet deploy-sync checker is blocked by missing unrelated clones; shared
catalog, counsel, census and checker files remain unchanged.
