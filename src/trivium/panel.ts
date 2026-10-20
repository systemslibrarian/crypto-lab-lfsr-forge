import { berlekampMasseyTrace, forecast, type BmResult } from '../lfsr/bm'
import { connection, generate, randomNonzeroState, type Bit } from '../lfsr/lfsr'
import { advance, AND_TAPS, clock, hex, INIT_ROUNDS, keystreamBits, loadState, parse80, type TriviumState } from './trivium'
import { checkVectors } from './vectors'
import { buildSystem, type Recovery } from './zero-round'

export const TRIVIUM_NEGATIVE = 'A keystream that defeats Berlekamp–Massey is not thereby secure: with its 1,152 warm-up rounds removed, this Trivium still shows no short recurrence while its key is read off the first output bits.'
export type LfsrCapture = { coefficients: Bit[]; initial: Bit[]; observed: Bit[] }
type Fit = { bits: Bit[]; bm: BmResult; actual: Bit[]; predicted: Bit[] | null; revealed: boolean; label: string; degree?: number }
const safe = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const bits = (a: readonly number[] | Uint8Array) => Array.from(a).join('')
const verdict = (tone: string, label: string, detail: string) => `<div class="verdict ${tone}" data-verdict="${safe(label)}"><strong>${safe(label)}</strong><p>${safe(detail)}</p></div>`
const displayBits = (label: string, value: readonly number[] | Uint8Array, claim: string) => `<p>${safe(label)}</p><code class="bits" data-tri="${claim}">${bits(value)}</code>`

export function mountTriviumPanel(before: HTMLElement, capturedLfsr: () => LfsrCapture | null): void {
  const panel = document.createElement('section'); panel.className = 'panel'; panel.id = 'panel-trivium'
  panel.innerHTML = `<div class="panel-head"><span class="number">06</span><div><h2>The deployed answer: Trivium</h2><p>The same rebuilding algorithm, a different register design.</p></div></div>
    <p>The individual registers above update with XOR. Geffe already adds a nonlinear selector, but its correlations still leak the hidden states. Trivium, standardized for small hardware, puts three AND gates inside its coupled register feedback. Run the same rebuilding algorithm and see why its 1,152 warm-up steps matter.</p>
    <div id="tri-kat" role="status"></div>
    <div class="card" id="tri-register"><h3>1. Three registers, three AND gates</h3>
      <div class="two-col"><div><label for="tri-key">Trivium key · 20 hex digits</label><input id="tri-key" value="0053a6f94c9ff24598eb" spellcheck="false" autocomplete="off"></div><div><label for="tri-iv">Public IV · 20 hex digits</label><input id="tri-iv" value="0d74db42a91077de45ac" spellcheck="false" autocomplete="off"></div></div>
      <div class="actions"><button id="tri-fresh">Fresh key and IV</button><button id="tri-step">Clock one tick</button><button id="tri-init">Run initialization (1152)</button></div>
      <p class="small">The strips show every state bit. Outlined taps marked AND are the only nonlinear terms. A → B, B → C, C → A: each register feeds the next. Input bit K1 is the most significant bit of the last displayed byte; output bytes pack bits least-significant first.</p>
      <div id="tri-state" role="status"></div>
    </div>
    <div class="card" id="tri-profile"><h3>2. Berlekamp–Massey meets Trivium</h3>
      <label for="tri-n">Observed prefix length N</label><select id="tri-n"><option>128</option><option>256</option><option>512</option><option selected>1024</option></select>
      <div class="actions"><button id="tri-bm">Run BM on Trivium</button><button id="tri-lfsr">Run BM on panel 03's LFSR</button><button id="tri-freeze">Freeze forecast</button><button id="tri-reveal">Reveal continuation</button></div>
      <p>Card 2 always uses the specified 1,152-round initialization. These are measured prefix fits, not a measurement of the cipher's global linear complexity. Freeze both predictions before revealing the next 64 bits.</p>
      <div id="tri-fit" role="status"></div><div id="tri-chart"></div>
    </div>
    <div class="card" id="tri-warmup"><h3>3. Why the warm-up exists</h3>
      <fieldset><legend>Initialization rounds for the recovery experiment</legend><label><input type="radio" name="tri-rounds" value="1152" checked> 1152 · Trivium (specified)</label><label><input type="radio" name="tri-rounds" value="0"> 0 · BROKEN: Trivium with 0 initialization rounds</label></fieldset>
      <p id="tri-mode"></p><div class="actions"><button id="tri-observe">Observe output</button><button id="tri-recover" disabled>Recover key</button><button id="tri-cancel" class="secondary" disabled>Cancel recovery</button><button id="tri-compare" disabled>Compare with hidden key</button></div>
      <p class="small">Only the public IV and a copied 1,024-bit observation reach the worker. The controller compares the hidden key separately. This is a local teaching boundary, not protection against browser developer tools.</p>
      <div id="tri-recovery" role="status"></div>
      <details><summary>Reduced initialization and published attacks</summary><p>The full initialization is 4 × 288 = 1,152 steps. Dinur and Shamir's <a href="https://eprint.iacr.org/2008/385">2008/385 cube-attack paper</a> (EUROCRYPT 2009) reports key recovery for the 672-, 735- and 767-round variants at 2¹⁹, 2³⁰ and 2⁴⁵ bit operations. This page executes only the zero-round linear attack, not a cube attack. Katz–Lindell's 2021 third edition §7.1.3 says no better-than-exhaustive attack was then known against the full cipher; that is a historical statement, not a current security certificate.</p><p><a href="https://cr.yp.to/streamciphers/trivium/desc.pdf">Trivium specification</a> · <a href="https://webstore.iec.ch/en/publication/11423">ISO/IEC 29192-3:2012</a> · <a href="https://github.com/cantora/avr-crypto-lib/blob/2a5b018aa71694c5021f41e469234c3c5adb8784/testvectors/trivium-unverified.test-vectors">Pinned archived eSTREAM vector log</a>. The original eSTREAM host was unavailable; all four slices and the XOR digest of three archived vectors are checked here.</p></details>
    </div>`
  before.before(panel)
  const node = <T extends HTMLElement>(id: string) => panel.querySelector<T>(`#${id}`)!
  const keyInput = node<HTMLInputElement>('tri-key'), ivInput = node<HTMLInputElement>('tri-iv'), nInput = node<HTMLSelectElement>('tri-n')
  const stateView = node('tri-state'), fitView = node('tri-fit'), recoveryView = node('tri-recovery')
  const roundCount = () => Number(panel.querySelector<HTMLInputElement>('input[name="tri-rounds"]:checked')!.value)
  const mode = () => roundCount() === 0 ? 'BROKEN: Trivium with 0 initialization rounds' : 'Trivium · 1152 initialization rounds'
  const values = () => ({ key: parse80(keyInput.value), iv: parse80(ivInput.value, 'IV') })
  const count = () => { const n = Number(nInput.value); if (![128, 256, 512, 1024].includes(n)) throw new Error('N must be 128, 256, 512 or 1024.'); return n }
  let state: TriviumState | null = null, ticks = 0, initialized = false, last: ReturnType<typeof clock> | null = null
  let triviumFit: Fit | null = null, lfsrFit: Fit | null = null
  let hiddenKey: Uint8Array | null = null, observed: Uint8Array | null = null, publicIv: Uint8Array | null = null, observedRounds = INIT_ROUNDS
  let observedBm: BmResult | null = null, recovered: Recovery | null = null, confirmed: boolean | null = null
  let worker: Worker | null = null, epoch = 0, working = false, message = ''
  const kats = checkVectors(), katOk = kats.passed === kats.total
  node('tri-kat').innerHTML = verdict(katOk ? 'good' : 'failure', katOk ? 'eSTREAM CHECKS PASSED' : 'eSTREAM CHECKS FAILED', `${kats.passed}/${kats.total} published slice/digest checks at 1152 initialization rounds. Implementation checks are not a security proof.`)
  function requireKat(): void { if (!katOk) throw new Error('Published eSTREAM checks failed; experiments are disabled.') }
  function attempt(target: HTMLElement, action: () => void): void { try { requireKat(); action() } catch (e) { target.innerHTML = verdict('failure', 'INPUT / EXPERIMENT ERROR', e instanceof Error ? e.message : String(e)) } }
  function showState(): void {
    if (!state) { stateView.textContent = 'No state loaded. Enter an 80-bit key and IV.'; return }
    stateView.innerHTML = `<p>${initialized ? 'Trivium · 1152 initialization rounds' : 'Pre-initialization inspection — BROKEN if used as keystream'} · clocks since ${initialized ? 'initialization' : 'loading'}: <strong data-tri="ticks">${ticks}</strong></p>` +
      [[0, 93, 'A · s1–s93 → feedback into B'], [93, 177, 'B · s94–s177 → feedback into C'], [177, 288, 'C · s178–s288 → feedback into A']].map(([start, end, label]) => `<div class="tri-strip"><p>${label}</p><div class="tri-bits" role="group" aria-label="Register ${String(label)[0]} state">${Array.from(state!.slice(Number(start), Number(end)), (b, i) => { const position = Number(start) + i + 1, tap = AND_TAPS.some(pair => pair.some(p => p === position)); return `<span class="tri-bit${tap ? ' tri-and' : ''}" title="s${position}${tap ? ' AND tap' : ''}"${tap ? ` role="img" aria-label="AND tap s${position}: ${b}"` : ''}>${b}${tap ? '<small>AND</small>' : ''}</span>` }).join('')}</div><details><summary>Exact ${String(label)[0]} state and position order</summary><code class="bits" data-tri="register-${String(label)[0]}">${bits(state!.slice(Number(start), Number(end)))}</code></details></div>`).join('') +
      (last ? `<p>Raw output taps before this clock: t1 = <strong data-tri="t1">${last.t1}</strong>, t2 = <strong data-tri="t2">${last.t2}</strong>, t3 = <strong data-tri="t3">${last.t3}</strong>. Output z = <strong data-tri="z">${last.z}</strong>.</p><p>After AND and cross-register XOR: feedback into B / C / A = <span data-tri="feedback">${last.feedback.join(' / ')}</span>. Strips now show the next state.</p>` : '<p>Clock once to inspect the executed output and feedback terms.</p>')
  }
  function reloadState(): void { state = null; last = null; ticks = 0; initialized = false; try { const { key, iv } = values(); state = loadState(key, iv) } catch { /* Invalid input keeps state unloaded; action reports precise error. */ } showState() }
  function showFits(): void {
    const fitHtml = (fit: Fit | null, id: string) => !fit ? `<p>${id === 'trivium' ? 'Trivium' : 'LFSR'} profile not yet measured.</p>` : `<div data-tri="${id}-fit"><h4>${safe(fit.label)}</h4><p>Observed N = ${fit.bits.length}; fitted L<sub>N</sub> = <strong data-tri="${id}-L">${fit.bm.length}</strong>${fit.degree ? `; disclosed register degree <strong data-tri="lfsr-degree">${fit.degree}</strong>` : ''}.</p><details><summary>${id === 'trivium' ? 'Trivium' : 'LFSR'} observed prefix</summary>${displayBits('Observed bits', fit.bits, `${id}-prefix`)}</details>${fit.predicted ? displayBits('Frozen prediction · next 64 bits', fit.predicted, `${id}-prediction`) : '<p>Forecast not frozen.</p>'}${fit.revealed ? displayBits('Revealed continuation', fit.actual, `${id}-actual`) + verdict(fit.predicted!.every((b, i) => b === fit.actual[i]) ? 'alarm' : 'good', fit.predicted!.every((b, i) => b === fit.actual[i]) ? 'FORECAST VERIFIED' : 'HELD — FORECAST FAILED', 'A result of this finite 64-bit check, not a security proof.') : ''}</div>`
    fitView.innerHTML = fitHtml(triviumFit, 'trivium') + fitHtml(lfsrFit, 'lfsr')
    const fits = [{ fit: triviumFit, id: 'trivium', color: '#f6b556', dash: '' }, { fit: lfsrFit, id: 'lfsr', color: '#a8e3b4', dash: '8 5' }].filter(x => x.fit)
    const n = Math.max(...fits.map(x => x.fit!.bits.length), 128)
    node('tri-chart').innerHTML = fits.length ? `<figure class="tri-profile-chart"><svg viewBox="0 0 600 250" role="img" aria-label="Measured linear complexity profiles: Trivium solid, LFSR dashed, N over two dotted"><path d="M35 20V215H580" fill="none" stroke="#c4d0c9"/><path d="M35 215L580 117.5" fill="none" stroke="#c4d0c9" stroke-dasharray="2 6"/><text x="580" y="105" text-anchor="end" fill="#f3f0e9">N/2 reference</text>${fits.map(({ fit, id, color, dash }) => `<polyline data-tri="${id}-profile" points="${fit!.bm.trace.map(row => `${35 + 545 * row.processed / n},${215 - 195 * row.afterLength / n}`).join(' ')}" fill="none" stroke="${color}" stroke-width="3" stroke-dasharray="${dash}"/>`).join('')}<text x="38" y="242" fill="#f3f0e9">0 observed bits</text><text x="580" y="242" text-anchor="end" fill="#f3f0e9">${n}</text><text x="42" y="35" fill="#f3f0e9">fitted length L</text></svg><figcaption>Trivium: solid amber. LFSR: dashed green. N/2: dotted gray. Exact final counts are printed above; this profile does not certify security.</figcaption></figure>` : ''
  }
  function stop(): void { epoch++; worker?.terminate(); worker = null; working = false; node<HTMLButtonElement>('tri-cancel').disabled = true }
  function showRecovery(): void {
    node('tri-mode').textContent = mode()
    node<HTMLButtonElement>('tri-recover').disabled = !observed || working
    node<HTMLButtonElement>('tri-cancel').disabled = !working
    node<HTMLButtonElement>('tri-compare').disabled = !recovered || recovered.candidates.length !== 1 || working
    if (!observed || !observedBm || !publicIv) { recoveryView.textContent = message || 'Observe output, then try the public zero-round recovery equations.'; return }
    const system = buildSystem(publicIv, observed), short = observedBm.length <= 12
    recoveryView.innerHTML = `<p>${observedRounds === 0 ? 'BROKEN: Trivium with 0 initialization rounds' : 'Trivium · 1152 initialization rounds'} · 1,024 observed bits.</p>` +
      verdict(short ? 'alarm' : 'good', short ? 'SHORT RECURRENCE FOUND' : 'NO SHORT RECURRENCE', `Measured N = 1024. “Short” here means at most 12 stages, the earlier LFSR challenge bound. Passing this check is not a security proof.`) +
      `<p>Fitted L<sub>N</sub> = <strong data-tri="zero-L">${observedBm.length}</strong>.</p><details><summary>Observed output and the 66 equations</summary>${displayBits('Public observed output', observed, 'zero-prefix')}<p>Rank <strong data-tri="rank">${system.rank}</strong> over 80 unknown key bits; <strong data-tri="free">${system.free.length}</strong> free bits → ${2 ** system.free.length} candidates. K1–K80 use the specification's state order. These equations describe zero initialization only; for full initialization their later-output check should reject.</p><ol class="tri-equations">${system.equations.map(e => `<li>${e.positions.map(p => `K${p}`).join(' XOR ')} = ${e.rhs}</li>`).join('')}</ol></details><p data-tri="progress">${safe(message)}</p>`
    if (recovered) {
      recoveryView.innerHTML += `<p>Tested <strong data-tri="tested">${recovered.tested}</strong> assignments; <strong data-tri="candidate-count">${recovered.candidates.length}</strong> consistent keys after all observed bits · ${recovered.elapsedMs.toFixed(1)} ms locally.</p>`
      if (recovered.candidates.length === 1) recoveryView.innerHTML += `<p>Recovered candidate (not yet ground-truth confirmation):</p><code class="bits" data-tri="recovered-key">${hex(recovered.candidates[0])}</code>` + verdict('neutral', 'ONE CONSISTENT KEY', 'Compare with the hidden key as a separate controller step.')
      else recoveryView.innerHTML += verdict('neutral', recovered.candidates.length ? 'AMBIGUOUS — STOP' : 'NO CONSISTENT ZERO-ROUND KEY', `${recovered.candidates.length} candidates; no key is selected. This finite attack outcome is not a security certificate.`)
    }
    if (confirmed !== null) {
      recoveryView.innerHTML += `<p>Hidden key, disclosed only by this comparison:</p><code class="bits" data-tri="hidden-key">${hex(hiddenKey!)}</code>` + verdict(confirmed ? 'alarm' : 'failure', confirmed && !short && observedRounds === 0 ? 'NO SHORT RECURRENCE — AND KEY RECOVERED' : confirmed ? 'KEY CONFIRMED' : 'KEY DID NOT MATCH', `${observedRounds === 0 ? 'BROKEN: Trivium with 0 initialization rounds.' : 'Trivium · 1152 initialization rounds.'} Separate byte-for-byte comparison ${confirmed ? 'matched' : 'failed'}.`)
      if (confirmed && !short && observedRounds === 0) recoveryView.innerHTML += `<div class="negative-claim" data-claim="trivium-negative">${TRIVIUM_NEGATIVE}</div>`
    }
  }
  function retire(): void { stop(); observed = null; hiddenKey = null; publicIv = null; observedBm = null; recovered = null; confirmed = null; message = 'Inputs changed; previous observations, forecasts and recovery verdicts retired.'; triviumFit = null; lfsrFit = null; reloadState(); showFits(); showRecovery() }
  const fingerprint = () => [keyInput.value, ivInput.value, nInput.value, roundCount()].join('|')
  let currentFingerprint = fingerprint()
  for (const input of panel.querySelectorAll('input,select')) for (const event of ['input', 'change']) input.addEventListener(event, () => { const next = fingerprint(); if (next !== currentFingerprint) { currentFingerprint = next; retire() } })
  node('tri-fresh').addEventListener('click', () => attempt(stateView, () => { keyInput.value = hex(crypto.getRandomValues(new Uint8Array(10))); ivInput.value = hex(crypto.getRandomValues(new Uint8Array(10))); currentFingerprint = fingerprint(); retire() }))
  node('tri-step').addEventListener('click', () => attempt(stateView, () => { values(); if (!state) reloadState(); last = clock(state!); state = last.next; ticks++; showState() }))
  node('tri-init').addEventListener('click', () => attempt(stateView, () => { const { key, iv } = values(); state = loadState(key, iv); for (let i = 0; i < INIT_ROUNDS; i++) advance(state); initialized = true; ticks = 0; last = null; showState() }))
  node('tri-bm').addEventListener('click', () => attempt(fitView, () => { const { key, iv } = values(), n = count(), output = Array.from(keystreamBits(key, iv, n + 64)) as Bit[]; triviumFit = { bits: output.slice(0, n), bm: berlekampMasseyTrace(output.slice(0, n)), actual: output.slice(n), predicted: null, revealed: false, label: 'Trivium · 1152 initialization rounds' }; showFits() }))
  node('tri-lfsr').addEventListener('click', () => attempt(fitView, () => { const n = count(), capture = capturedLfsr(), c = capture?.coefficients ?? connection(7, [1, 7]), initial = capture?.initial ?? randomNonzeroState(7), output = generate(c, initial, n + 64).bits; lfsrFit = { bits: output.slice(0, n), bm: berlekampMasseyTrace(output.slice(0, n)), actual: output.slice(n), predicted: null, revealed: false, degree: initial.length, label: capture ? `Panel 03's LFSR · same generator, ${n}-bit comparison capture` : `Fresh disclosed LFSR · degree 7, taps [1, 7], state ${initial.join('')} (panel 03 has no capture)` }; showFits() }))
  node('tri-freeze').addEventListener('click', () => attempt(fitView, () => { if (!triviumFit && !lfsrFit) throw new Error('Run a BM profile before freezing.'); for (const fit of [triviumFit, lfsrFit]) if (fit && !fit.predicted) fit.predicted = forecast(fit.bits, fit.bm.coefficients, fit.bm.length, 64); showFits() }))
  node('tri-reveal').addEventListener('click', () => attempt(fitView, () => { if (![triviumFit, lfsrFit].some(f => f?.predicted)) throw new Error('Freeze a forecast before revealing continuation.'); for (const fit of [triviumFit, lfsrFit]) if (fit?.predicted) fit.revealed = true; showFits() }))
  node('tri-observe').addEventListener('click', () => attempt(recoveryView, () => { const { key, iv } = values(); stop(); hiddenKey = new Uint8Array(key); publicIv = new Uint8Array(iv); observedRounds = roundCount(); if (![0, INIT_ROUNDS].includes(observedRounds)) throw new Error('Select 0 or 1152 initialization rounds.'); observed = keystreamBits(hiddenKey, publicIv, 1024, observedRounds); observedBm = berlekampMasseyTrace(Array.from(observed)); recovered = null; confirmed = null; message = 'Observation frozen. Recover using public IV and output only.'; showRecovery() }))
  node('tri-recover').addEventListener('click', () => attempt(recoveryView, () => {
    if (!observed || !publicIv || working) return
    stop(); recovered = null; confirmed = null; const runId = epoch
    worker = new Worker(new URL('./attack.worker.ts', import.meta.url), { type: 'module' })
    working = true
    message = 'Enumerating 16,384 public-equation candidates…'; showRecovery()
    worker.onmessage = event => { const reply = event.data; if (reply.runId !== epoch) return; if (reply.kind === 'progress') { message = `Candidate search: ${reply.done} / ${reply.total}`; node('tri-recovery').querySelector('[data-tri="progress"]')!.textContent = message; return } stop(); if (reply.kind === 'result') { recovered = reply.result; message = 'Every candidate checked against the whole observed prefix.' } else message = `Recovery failed: ${reply.message}`; showRecovery() }
    worker.onerror = () => { if (runId !== epoch) return; stop(); message = 'Worker failed. No recovery verdict was issued.'; showRecovery() }
    try { worker.postMessage({ kind: 'run', runId, iv: new Uint8Array(publicIv), observed: new Uint8Array(observed) }) } catch (error) { stop(); throw error }
  }))
  node('tri-cancel').addEventListener('click', () => { stop(); recovered = null; confirmed = null; message = 'Recovery cancelled. No key-recovery verdict was issued.'; showRecovery() })
  node('tri-compare').addEventListener('click', () => attempt(recoveryView, () => { if (!hiddenKey || recovered?.candidates.length !== 1) throw new Error('Exactly one consistent candidate is required.'); confirmed = recovered.candidates[0].every((b, i) => b === hiddenKey![i]) && recovered.candidates[0].length === hiddenKey.length; showRecovery() }))
  window.addEventListener('pagehide', stop)
  reloadState(); showFits(); showRecovery()
}
