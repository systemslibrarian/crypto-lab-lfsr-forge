import './style.css'
import { berlekampMasseyTrace, forecast, type BmResult } from './lfsr/bm'
import { clock, connection, formatConnection, generate, parseBits, period, PRIMITIVE_TAPS, randomNonzeroState, type Bit } from './lfsr/lfsr'
import { combine, GEFFE, geffeBits, type GeffeStates } from './geffe/geffe'
import { DEFAULT_BUDGET, packedToState, type CorrelationResult } from './geffe/correlation'

const root = document.querySelector<HTMLElement>('#app')!
const bitString = (bits: readonly number[], max = 128) => bits.slice(0, max).join('') + (bits.length > max ? '…' : '')
const safe = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
const randomInt = (maximum: number) => {
  const range = 2 ** 32
  const limit = range - range % maximum
  const value = new Uint32Array(1)
  do { crypto.getRandomValues(value) } while (value[0] >= limit)
  return value[0] % maximum
}
const randomGeffeStates = (): GeffeStates => ({ r1: randomNonzeroState(7), r2: randomNonzeroState(11), r3: randomNonzeroState(13) })
type Hidden = { coefficients: Bit[]; initial: Bit[]; observed: Bit[] }
type SingleRun = { input: Bit[]; predicted: Bit[]; actual: Bit[] | null; matched: boolean | null; parametersConfirmed: boolean | null; length: number; coefficients: readonly Bit[]; runId: number }
type GeffeRun = { input: Bit[]; result: CorrelationResult; actual: Bit[] | null; matched: boolean | null; statesConfirmed: boolean | null; runId: number; inspectionLength: number | null; inspectedComplexity: number | null; truthTableChecks: number | null; measuredPeriods: number[] | null }

let visibleState: Bit[] = [1, 0, 0, 1, 0]
const visibleC = connection(5, [2, 5])
let visibleClock = 0
let lastVisible: ReturnType<typeof clock> | null = null
let hidden: Hidden | null = null
let singleRun: SingleRun | null = null
let manualBits: Bit[] = []
let manualDraft = ''
let manualMode = false
let manualError = ''
let traceIndex = 0
let fixture = ''
let inspectStates: GeffeStates = { r1: [1, 0, 0, 0, 0, 0, 0], r2: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], r3: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }
let inspectClock = 0
let inspectLast: [Bit, Bit, Bit, Bit] | null = null
let profile: { complexity: number; predicted: Bit[]; actual: Bit[]; prefix: Bit[] } | null = null
let geffeOriginal: GeffeStates | null = null
let geffeCapture: Bit[] = []
let geffeRun: GeffeRun | null = null
let worker: Worker | null = null
let activeWorkerId = 0
let working = false
let workerProgress = ''
let globalRunId = 0

function freshHidden(): void {
  const degree = 3 + randomInt(10)
  hidden = { coefficients: connection(degree, PRIMITIVE_TAPS[degree]), initial: randomNonzeroState(degree), observed: [] }
  singleRun = null
}
function collect(count: number): void {
  if (count === 0) return
  if (!hidden) freshHidden()
  hidden!.observed = generate(hidden!.coefficients, hidden!.initial, hidden!.observed.length + count).bits
  singleRun = null
}
function analysis(): { bits: Bit[]; result: BmResult; mode: string } {
  const bits = manualMode ? manualBits : hidden?.observed ?? []
  return { bits, result: berlekampMasseyTrace(bits), mode: manualMode ? 'User-entered sequence' : 'Hidden challenge capture' }
}
function dataVerdict(value: string, label: string, detail: string): string {
  return `<div class="verdict ${value}" data-verdict="${safe(label)}"><strong>${safe(label)}</strong><p>${safe(detail)}</p></div>`
}
function renderVisible(): void {
  const view = document.querySelector('#visible-view')!
  const taps = [2, 5].map(tap => `state[${5 - tap}]`).join(' XOR ')
  view.innerHTML = `<div class="register" role="group" aria-label="Visible register state">${visibleState.map((bit, index) => `<div class="cell"><span class="cell-index">${index}</span><strong>${bit}</strong></div>`).join('')}</div>
    <p class="mono">Clock ${visibleClock} · C(D) = ${formatConnection(visibleC)} · next output = ${visibleState[0]}</p>
    <p>Feedback uses ${taps}. ${lastVisible ? `Last step: output <strong>${lastVisible.output}</strong>; terms ${lastVisible.terms.join(' XOR ')} = <strong>${lastVisible.feedback}</strong>; state shifted left.` : 'Step once to see the executed terms.'}</p>
    <details><summary>Convention and reciprocal polynomial</summary><p>state[0] is output before the clock. After output, state[j+1] moves to state[j], and feedback enters the last cell. The characteristic polynomial is X^5 · C(1/X) = X^5 + X^3 + 1. Polynomial coefficients are stored constant-term first.</p></details>`
  const challenge = document.querySelector('#hidden-view')!
  challenge.innerHTML = hidden ? `<p class="mono">Observed N = <strong>${hidden.observed.length}</strong> bits · supported hidden degree 3–12 · guaranteed target 2U = 24 bits</p><code class="bits">${bitString(hidden.observed, 160) || 'No bits collected yet'}</code><p class="small">The selected polynomial and nonzero state stay behind the experiment controller until you request parameter confirmation. Browser developer tools can inspect local state; this is a teaching boundary.</p>` : '<p>Start a fresh hidden challenge.</p>'
}
function renderBm(): void {
  const { bits, result, mode } = analysis()
  traceIndex = Math.min(traceIndex, Math.max(0, result.trace.length - 1))
  const selected = result.trace[traceIndex]
  const chart = result.trace.map((row, index) => `<span title="N ${row.processed}: L_N ${row.afterLength}" class="bar ${index === traceIndex ? 'selected' : ''}" style="height:${Math.max(4, 100 * row.afterLength / Math.max(1, bits.length))}%"></span>`).join('')
  document.querySelector('#bm-view')!.innerHTML = `<p class="mono">${mode} · N = <strong>${bits.length}</strong> · fitted L<sub>N</sub> = <strong data-claim="bm-length">${result.length}</strong> · C(D) = <strong>${formatConnection(result.coefficients)}</strong></p>
    <p>A discrepancy means the current recurrence expected a different next bit. BM corrects it using a saved earlier polynomial; some corrections also increase the shortest fitted register length.</p>
    ${manualMode ? `<p>Candidate next 32 bits from this finite-prefix fit, without an independent generator check:</p><code class="bits" data-claim="manual-candidate">${bitString(forecast(bits, result.coefficients, result.length, 32))}</code>` : ''}
    <div class="chart" role="img" aria-label="Linear complexity after each observed bit, from 1 to ${bits.length}">${chart || '<span class="empty-chart">Collect bits to draw the profile.</span>'}</div>
    <p class="small">Bars show L<sub>N</sub> against N. The N/2 line is a reference for random-looking prefixes, not a security threshold.</p>
    <div class="step-controls"><button data-act="trace-prev" ${traceIndex === 0 ? 'disabled' : ''}>Previous BM step</button><span>${result.trace.length ? `${traceIndex + 1} of ${result.trace.length}` : 'No steps yet'}</span><button data-act="trace-next" ${traceIndex >= result.trace.length - 1 ? 'disabled' : ''}>Next BM step</button></div>
    ${selected ? `<div class="trace-card"><p><strong>Input index ${selected.index}</strong> · bit ${selected.input} · discrepancy <strong>${selected.discrepancy}</strong> · L<sub>N</sub> ${selected.beforeLength} → ${selected.afterLength}</p><p>C(D): ${formatConnection(selected.beforeC)} → ${formatConnection(selected.afterC)}</p><details><summary>Trace bookkeeping</summary><p>B(D): ${formatConnection(selected.beforeB)} → ${formatConnection(selected.afterB)} · last length update index: ${selected.beforeLastLengthUpdate} → ${selected.afterLastLengthUpdate} · correction shift: ${selected.shift}</p></details></div>` : ''}
    <details><summary>Full BM trace table</summary><div class="table-wrap" tabindex="0"><table><caption>Immutable snapshots after each input bit</caption><thead><tr><th scope="col">N</th><th scope="col">bit</th><th scope="col">d</th><th scope="col">L<sub>N</sub></th><th scope="col">C(D)</th></tr></thead><tbody>${result.trace.map(row => `<tr><th scope="row">${row.processed}</th><td>${row.input}</td><td>${row.discrepancy}</td><td>${row.afterLength}</td><td>${formatConnection(row.afterC)}</td></tr>`).join('')}</tbody></table></div></details>`
  const input = document.querySelector<HTMLTextAreaElement>('#manual-input')!
  if (document.activeElement !== input) input.value = manualDraft
  document.querySelector('#manual-error')!.textContent = manualError
}
function renderSingle(): void {
  const target = document.querySelector('#single-view')!
  if (!singleRun) { target.innerHTML = '<p class="muted">Collect a hidden prefix, then freeze a forecast. A prefix fit alone is provisional.</p>'; return }
  const run = singleRun
  const mismatches = run.actual?.flatMap((bit, index) => bit === run.predicted[index] ? [] : [index]) ?? []
  target.innerHTML = `<p class="mono">Run ${run.runId} · attack capture N = ${run.input.length} · L<sub>N</sub> = ${run.length} · forecast indices ${run.input.length}–${run.input.length + run.predicted.length - 1}</p>
    ${dataVerdict('neutral', 'PREFIX FITTED', `BM fitted ${run.input.length} supplied bits.`)}
    <div class="compare"><div><span>Frozen prediction</span><code class="bits" data-claim="single-prediction">${bitString(run.predicted)}</code></div><div><span>Original generator</span><code class="bits" data-claim="single-actual">${run.actual ? bitString(run.actual) : 'Not revealed'}</code></div></div>
    ${run.actual ? dataVerdict(run.matched ? 'alarm' : 'failure', run.matched ? `NEXT ${run.predicted.length} BITS PREDICTED` : 'PREFIX FITTED — PREDICTION FAILED', run.matched ? `All ${run.predicted.length} frozen bits matched the original continuation.` : `Mismatches at forecast offsets ${mismatches.slice(0, 16).join(', ')}${mismatches.length > 16 ? '…' : ''}.`) : '<button data-act="single-verify">Reveal original next 64 bits</button>'}
    ${run.actual && run.parametersConfirmed === null ? '<button data-act="single-confirm">Compare original parameters</button>' : ''}
    ${run.parametersConfirmed !== null ? dataVerdict(run.parametersConfirmed ? 'alarm' : 'neutral', run.parametersConfirmed ? 'LFSR PARAMETERS CONFIRMED' : 'PARAMETERS DID NOT MATCH', run.parametersConfirmed ? 'The independent controller matched the recovered recurrence and aligned initial state.' : 'A fitted recurrence or short successful forecast did not identify this hidden register.') : ''}`
}
function renderInspect(): void {
  document.querySelector('#inspect-view')!.innerHTML = `<p class="mono">Inspection clock ${inspectClock} · fixed lengths 7 / 11 / 13</p>
    ${inspectLast ? `<p>Last component outputs: x1 = <strong>${inspectLast[0]}</strong>, x2 = <strong>${inspectLast[1]}</strong>, x3 = <strong>${inspectLast[2]}</strong>. Selector x2 chose ${inspectLast[1] ? 'x1' : 'x3'}; combined z = <strong>${inspectLast[3]}</strong>.</p>` : '<p>Step the disclosed registers to see x2 select x1 or x3.</p>'}
    <div class="register-group"><div>R1 <code>${inspectStates.r1.join('')}</code></div><div>R2 <code>${inspectStates.r2.join('')}</code></div><div>R3 <code>${inspectStates.r3.join('')}</code></div></div>
    <details><summary>Combiner truth table and public profile</summary><div class="table-wrap" tabindex="0"><table><caption>z = (x1 AND x2) XOR ((1 XOR x2) AND x3)</caption><thead><tr><th>x1</th><th>x2</th><th>x3</th><th>z</th></tr></thead><tbody>${[0, 1].flatMap(a => [0, 1].flatMap(b => [0, 1].map(c => `<tr><td>${a}</td><td>${b}</td><td>${c}</td><td>${combine(a as Bit, b as Bit, c as Bit)}</td></tr>`))).join('')}</tbody></table></div><p>R1: ${formatConnection(GEFFE.r1)} (period 127); R2: ${formatConnection(GEFFE.r2)} (period 2,047); R3: ${formatConnection(GEFFE.r3)} (period 8,191). The full sequence has linear complexity 233 under this profile. These parameters are public; states are secret in the attack session.</p></details>
    ${profile ? `<div class="trace-card"><p>Inspection capture: ${profile.prefix.length} bits · measured BM L<sub>N</sub> = <strong data-claim="geffe-complexity">${profile.complexity}</strong> · predicted next 64: <strong>${profile.predicted.join('') === profile.actual.join('') ? 'all matched' : 'mismatch'}</strong>.</p><p class="small">The fitted 233-stage linear recurrence is an equivalent generator, not identification of the three component states.</p></div>` : ''}`
}
function renderAttack(): void {
  const target = document.querySelector('#attack-view')!
  const run = geffeRun
  const capture = `<p class="mono">Attack capture: <strong data-claim="attack-n">${run?.input.length ?? geffeCapture.length}</strong> consecutive bits at clock zero · target 300 · BM sufficient bound 466</p><code class="bits">${bitString(run?.input ?? geffeCapture, 128) || 'No capture yet'}</code>`
  if (!run) { target.innerHTML = `${capture}<p class="muted">${working ? safe(workerProgress) : 'Start a fresh hidden Geffe session and scan its copied output.'}</p>`; return }
  const result = run.result
  const first = (ranking: typeof result.r1Ranking) => ranking.slice(0, 5).map((candidate, index) => `<tr><th scope="row">${index + 1}</th><td>${packedToState(candidate.packed, ranking === result.r1Ranking ? 7 : 13).join('')}</td><td>${candidate.matches} / ${candidate.total}</td></tr>`).join('')
  const unique = result.survivors.length === 1 && !!result.prediction
  const mismatches = run.actual?.flatMap((bit, index) => bit === result.prediction?.[index] ? [] : [index]) ?? []
  target.innerHTML = `${capture}<p class="small">Search budget: top ${DEFAULT_BUDGET.leadingR1} R1 and ${DEFAULT_BUDGET.leadingR3} R3 ranks (ties retained); at most ${DEFAULT_BUDGET.maxPairs} pairs and ${DEFAULT_BUDGET.maxR2Tests} R2 state trials. Leading rank alone is provisional.</p>
    <div class="two-col"><div><h4>R1 agreement ranking</h4><table><thead><tr><th>rank</th><th>state at clock 0</th><th>matches</th></tr></thead><tbody>${first(result.r1Ranking)}</tbody></table></div><div><h4>R3 agreement ranking</h4><table><thead><tr><th>rank</th><th>state at clock 0</th><th>matches</th></tr></thead><tbody>${first(result.r3Ranking)}</tbody></table></div></div>
    <p class="mono">Pairs tried ${result.metrics.pairAttempts} · R1 states scored ${result.metrics.r1StatesScored} · R3 states scored ${result.metrics.r3StatesScored} · R2 states tested ${result.metrics.r2StatesTested} · full-prefix checks ${result.metrics.fullPrefixChecks} · bit comparisons ${result.metrics.bitComparisons} · elapsed ${result.metrics.elapsedMs.toFixed(1)} ms</p>
    <details><summary>Conditional R2 constraints and pair results</summary><p>When x1 ≠ x3, each position demands x2 = z XOR x3. When x1 = x3, a different z contradicts the pair.</p><div class="table-wrap" tabindex="0"><table><thead><tr><th>R1</th><th>R3</th><th>selector positions</th><th>equal positions</th><th>first contradiction</th></tr></thead><tbody>${result.pairs.map(pair => `<tr><td>${pair.r1}</td><td>${pair.r3}</td><td>${pair.constrainedPositions}</td><td>${pair.equalPositions}</td><td>${pair.contradictionAt ?? 'none'}</td></tr>`).join('')}</tbody></table></div>${result.pairs.map(pair => `<details><summary>Pair R1 ${pair.r1}, R3 ${pair.r3}: constraining clock indices</summary><p class="mono">${pair.selectorIndices.join(', ')}</p></details>`).join('')}</details>
    ${unique ? dataVerdict('neutral', 'ONE TRIPLE WITHIN SEARCH BUDGET', `One candidate reproduced all ${run.input.length} captured bits. Its states await independent comparison.`) : dataVerdict('neutral', result.survivors.length ? 'AMBIGUOUS SEARCH' : 'NO CANDIDATE WITHIN BUDGET', `${result.survivors.length} triples survived; ${result.exhausted ? 'the search budget was exhausted.' : 'all configured pairs were processed.'}`)}
    ${unique ? `<div class="compare"><div><span>Frozen next 64 bits</span><code class="bits" data-claim="geffe-prediction">${bitString(result.prediction!)}</code></div><div><span>Original generator</span><code class="bits" data-claim="geffe-actual">${run.actual ? bitString(run.actual) : 'Not revealed'}</code></div></div>` : ''}
    ${unique && !run.actual ? '<button data-act="attack-verify">Reveal original next 64 bits</button>' : ''}
    ${run.actual ? dataVerdict(run.matched ? 'alarm' : 'failure', run.matched ? 'NEXT 64 BITS PREDICTED' : 'PREDICTION FAILED', run.matched ? 'All frozen bits matched the original continuation.' : `Mismatch at forecast offsets ${mismatches.slice(0, 16).join(', ')}.`) : ''}
    ${run.actual && run.statesConfirmed === null ? '<button data-act="attack-confirm">Compare original states</button>' : ''}
    ${run.statesConfirmed !== null ? dataVerdict(run.statesConfirmed ? 'alarm' : 'failure', run.statesConfirmed ? 'GEFFE STATES CONFIRMED' : 'STATES DID NOT MATCH', run.statesConfirmed ? 'The independent controller matched all three states at clock zero.' : 'The candidate did not recover the original secret states.') : ''}
    ${run.statesConfirmed && run.inspectedComplexity === null ? '<button data-act="attack-complexity">Measure later complexity with 466 bits</button>' : ''}
    ${run.inspectedComplexity !== null ? `<p class="mono">Later inspection total ${run.inspectionLength} bits · BM complexity <strong data-claim="later-complexity">${run.inspectedComplexity}</strong>. Original attack capture remained ${run.input.length} bits.</p>${dataVerdict(run.truthTableChecks === 8 && run.measuredPeriods?.join(',') === '127,2047,8191' && run.inspectedComplexity === 233 ? 'good' : 'failure', run.truthTableChecks === 8 && run.measuredPeriods?.join(',') === '127,2047,8191' && run.inspectedComplexity === 233 ? 'CONSTRUCTION CHECKS PASSED' : 'CONSTRUCTION CHECK FAILED', `Truth-table rows ${run.truthTableChecks}/8 · measured periods ${run.measuredPeriods?.join(' / ')} · measured complexity ${run.inspectedComplexity}/233.`)}` : ''}
    ${run.statesConfirmed && run.matched && run.inspectedComplexity === 233 && run.truthTableChecks === 8 && run.measuredPeriods?.join(',') === '127,2047,8191' ? `<div class="negative-claim" data-claim="negative"><strong>EXPECTED COMPLEXITY — STILL PREDICTABLE</strong><p>This Geffe generator's nonlinearity and high linear complexity do not prevent recovery of its secret state.</p><p>Truth table, component periods, complexity 233, frozen prediction, and independent state comparison passed. The recovered secret state is the security alarm.</p></div>` : ''}`
}

root.innerHTML = `<div class="shell"><section class="cl-hero" aria-labelledby="page-title"><div class="cl-hero-main"><p class="eyebrow">CRYPTO LAB / RECONSTRUCTION</p><h1 class="cl-hero-title" id="page-title">LFSR Forge</h1><p class="cl-hero-sub">LFSR · Berlekamp–Massey · Geffe generator · correlation attack</p><p class="cl-hero-desc">Reconstruct a generator from observed bits, freeze a prediction, and test it against the original continuation.</p></div><div class="cl-hero-why"><span class="cl-hero-why-label">WHY IT MATTERS</span><p>A stream cipher relies on output that an observer cannot predict. This lab shows how a simple register, and even a nonlinear combination of registers, can expose future bits and secret state.</p></div></section>
  <div class="intro"><p>A linear-feedback shift register (LFSR) shifts a row of bits and computes each new bit by XORing selected old bits. If you can observe enough output, Berlekamp–Massey finds a shortest recurrence that explains it. The attack here sees known keystream bits: for XOR encryption, aligned known plaintext and ciphertext reveal them.</p><p class="small">All mathematics runs in your browser. These deliberately small constructions are teaching examples, not production crypto. They do not show a break of modern stream ciphers or of every nonlinear combiner.</p></div>
  <nav class="journey" aria-label="Lab panels"><a href="#panel-register">01 Register</a><a href="#panel-bm">02 BM trace</a><a href="#panel-predict">03 Prediction</a><a href="#panel-geffe">04 Geffe</a><a href="#panel-attack">05 Recovery</a></nav>
  <section class="panel" id="panel-register"><div class="panel-head"><span class="number">01</span><div><h2>Watch a register run</h2><p>See a visible five-stage register, then collect output from a fresh hidden one.</p></div></div><div class="card"><h3>Visible mechanics</h3><div id="visible-view"></div><div class="actions"><button data-act="visible-step">Clock one step</button><button data-act="visible-reset" class="secondary">Reset walkthrough</button></div></div><div class="card"><h3>Hidden challenge</h3><div id="hidden-view"></div><div class="actions"><button data-act="hidden-new">New hidden register</button><button data-act="collect-one">Collect one bit</button><button data-act="collect-eight">Collect 8 bits</button><button data-act="collect-target">Collect to 24 bits</button></div><details><summary>Published challenge registry</summary><p>Degrees 3–12 use these primitive tap sets:</p><p class="mono">${Object.entries(PRIMITIVE_TAPS).map(([degree, taps]) => `${degree}: [${taps.join(', ')}]`).join(' · ')}</p><p>The selected degree and state are hidden during the attack. A declared upper bound U = 12 gives the sufficient target 2U = 24 within this single-LFSR model. Fewer bits can succeed or fail.</p></details></div></section>
  <section class="panel" id="panel-bm"><div class="panel-head"><span class="number">02</span><div><h2>Follow Berlekamp–Massey</h2><p>Step through each disagreement and the shortest fitted recurrence.</p></div></div><div class="card"><div id="bm-view"></div></div><div class="card"><h3>Analyze your own bits</h3><label for="manual-input">Binary sequence</label><textarea id="manual-input" rows="3" placeholder="Example: 001101110"></textarea><div class="actions"><button data-act="manual-analyze">Analyze entered sequence</button><button data-act="manual-clear" class="secondary">Return to hidden capture</button></div><p id="manual-error" class="error" role="alert"></p><p class="small">Up to 1,024 bits. Entered sequences have no original generator here, so they get a fitted model and candidate continuation, not a verified prediction or recovery verdict.</p></div></section>
  <section class="panel" id="panel-predict"><div class="panel-head"><span class="number">03</span><div><h2>Predict, freeze, check</h2><p>Compare 64 frozen forecast bits with the original hidden generator.</p></div></div><div class="card"><div class="actions"><button data-act="single-freeze">Freeze hidden forecast</button></div><div id="single-view"></div></div><div class="card"><h3>Try the edge cases</h3><div class="actions"><button data-act="fixture-ambiguity" class="secondary">Shared prefix</button><button data-act="fixture-failure" class="secondary">Early failure</button><button data-act="fixture-success" class="secondary">Early success</button></div><div id="fixture-view" class="fixture">${fixture}</div></div></section>
  <section class="panel" id="panel-geffe"><div class="panel-head"><span class="number">04</span><div><h2>Increase complexity</h2><p>The Geffe combiner uses x2 to choose between x1 and x3.</p></div></div><div class="card"><div id="inspect-view"></div><div class="actions"><button data-act="inspect-step">Clock disclosed registers</button><button data-act="inspect-new" class="secondary">Fresh inspection session</button><button data-act="inspect-profile">Measure 466-bit profile</button></div></div></section>
  <section class="panel" id="panel-attack"><div class="panel-head"><span class="number">05</span><div><h2>Recover hidden states</h2><p>Correlate R1 and R3, derive R2 constraints, then check a frozen continuation.</p></div></div><div class="card"><div class="actions"><button data-act="attack-new">New hidden Geffe session</button><button data-act="attack-fixture" class="secondary">Reproducible claim fixture</button><button data-act="attack-run">Run 300-bit attack</button><button data-act="attack-cancel" class="secondary" ${working ? '' : 'disabled'}>Cancel scan</button></div><p class="small">The inspection states above never feed this attack. Only a copied clock-zero output prefix and public profile reach the worker.</p><div id="attack-view" aria-live="polite"></div></div></section>
  <section class="afterword"><h2>What the result means</h2><p>A successful prefix fit is a model of observed bits. A frozen forecast checked against new output is stronger evidence. A state-recovery verdict requires a separate comparison with the original hidden state. Failure under a finite search budget is not a security certificate.</p><details><summary>Related labs and further reading</summary><ul><li><a href="https://systemslibrarian.github.io/crypto-lab-drift-key/">Drift Key</a> applies Berlekamp–Massey to BCH syndromes over an extension field.</li><li><a href="https://systemslibrarian.github.io/crypto-lab-air-stream/">Air Stream</a> shows SNOW 3G and ZUC with additional word-oriented structure; this attack is not claimed against them.</li><li><a href="https://systemslibrarian.github.io/crypto-lab-noise-to-numbers/">Noise to Numbers</a> assesses an LFSR sample statistically; this lab makes prediction explicit.</li><li><a href="https://systemslibrarian.github.io/crypto-lab-corrupted-oracle/">Corrupted Oracle</a> explores a different attacker observation model.</li><li><a href="https://systemslibrarian.github.io/crypto-lab-chacha20-stream/">ChaCha20 Stream</a> shows a modern stream construction outside this attack scope.</li><li><a href="https://systemslibrarian.github.io/crypto-lab-otp-vault/">OTP Vault</a> shows why known keystream and key reuse matter for XOR encryption.</li></ul><p>References: <a href="https://crypto.stanford.edu/~mironov/cs359/massey.pdf">Massey (1969)</a> and <a href="https://cacr.uwaterloo.ca/hac/about/chap6.pdf">Handbook of Applied Cryptography, chapter 6</a>.</p></details></section>
  <footer class="scripture-footer"><p>So whether you eat or drink or whatever you do, do it all for the glory of God. — 1 Corinthians 10:31</p></footer></div>`

function renderAll(): void { renderVisible(); renderBm(); renderSingle(); renderInspect(); renderAttack(); document.querySelector('#fixture-view')!.innerHTML = fixture }
function retireAttack(): void { if (worker && working) { worker.postMessage({ kind: 'cancel', runId: activeWorkerId }); worker.terminate(); worker = null }; working = false; activeWorkerId++; geffeRun = null; workerProgress = '' }
function startAttack(fixed = false): void {
  retireAttack()
  if (fixed) geffeOriginal = { r1: packedToState(1, 7), r2: packedToState(1, 11), r3: packedToState(1, 13) }
  else if (!geffeOriginal) geffeOriginal = randomGeffeStates()
  geffeCapture = geffeBits(geffeOriginal, 300)
  const input = [...geffeCapture]
  const runId = ++globalRunId
  activeWorkerId = runId
  working = true
  workerProgress = 'Scanning R1 and R3 agreement…'
  worker = new Worker(new URL('./geffe/attack.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<{ kind: string; runId: number; result?: CorrelationResult; phase?: string; done?: number; total?: number; message?: string }>) => {
    const message = event.data
    if (message.runId !== activeWorkerId) return
    if (message.kind === 'progress') { workerProgress = `${message.phase} scan: ${message.done} / ${message.total}`; renderAttack(); return }
    working = false
    worker?.terminate(); worker = null
    if (message.kind === 'result' && message.result) geffeRun = { input, result: message.result, actual: null, matched: null, statesConfirmed: null, runId, inspectionLength: null, inspectedComplexity: null, truthTableChecks: null, measuredPeriods: null }
    else workerProgress = message.message ?? 'Attack failed.'
    document.querySelector<HTMLButtonElement>('[data-act="attack-cancel"]')!.disabled = true
    renderAttack()
  }
  worker.postMessage({ kind: 'run', runId, observed: input, budget: DEFAULT_BUDGET })
  renderAttack()
}

root.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button[data-act]')
  if (!button) return
  const action = button.dataset.act
  try {
    switch (action) {
      case 'visible-step': lastVisible = clock(visibleC, visibleState); visibleState = lastVisible.next; visibleClock++; break
      case 'visible-reset': visibleState = [1, 0, 0, 1, 0]; visibleClock = 0; lastVisible = null; break
      case 'hidden-new': freshHidden(); manualBits = []; manualDraft = ''; manualMode = false; break
      case 'collect-one': collect(1); break
      case 'collect-eight': collect(8); break
      case 'collect-target': collect(Math.max(0, 24 - (hidden?.observed.length ?? 0))); break
      case 'trace-prev': traceIndex = Math.max(0, traceIndex - 1); break
      case 'trace-next': traceIndex++; break
      case 'manual-analyze': {
        manualDraft = document.querySelector<HTMLTextAreaElement>('#manual-input')!.value
        const parsed = parseBits(manualDraft)
        if (parsed.length > 1024) throw new Error('Use at most 1,024 bits for interactive analysis.')
        manualBits = parsed; manualMode = true; manualError = ''; traceIndex = 0; singleRun = null; break
      }
      case 'manual-clear': manualBits = []; manualDraft = ''; manualMode = false; manualError = ''; traceIndex = 0; break
      case 'single-freeze': {
        if (!hidden?.observed.length || manualMode) { manualError = manualMode ? 'Return to the hidden capture before independent verification.' : 'Collect at least one hidden bit first.'; break }
        const input = [...hidden.observed]
        const bm = berlekampMasseyTrace(input)
        singleRun = { input, predicted: forecast(input, bm.coefficients, bm.length, 64), actual: null, matched: null, parametersConfirmed: null, length: bm.length, coefficients: [...bm.coefficients], runId: ++globalRunId }
        break
      }
      case 'single-verify': {
        if (!singleRun || !hidden) break
        const run = singleRun
        run.actual = generate(hidden.coefficients, hidden.initial, run.input.length + run.predicted.length).bits.slice(run.input.length)
        run.matched = run.predicted.every((bit, index) => bit === run.actual![index])
        hidden.observed = [...run.input, ...run.actual]
        break
      }
      case 'single-confirm': {
        if (!singleRun?.actual || !hidden) break
        const run = singleRun
        run.parametersConfirmed = run.length === hidden.initial.length && hidden.coefficients.every((bit, index) => bit === (run.coefficients[index] ?? 0)) && hidden.initial.every((bit, index) => bit === run.input[index])
        break
      }
      case 'fixture-ambiguity': {
        const a = connection(3, [1, 3]), b = connection(3, [2, 3]), state: Bit[] = [1, 0, 0]
        const left = generate(a, state, 5).bits, right = generate(b, state, 5).bits
        fixture = `<p><strong>Shared prefix:</strong> ${left.slice(0, 4).join('')} from both primitive registers. Their next bits are <strong>${left[4]}</strong> and <strong>${right[4]}</strong>. The four bits do not identify the continuation.</p>`
        break
      }
      case 'fixture-failure': case 'fixture-success': {
        const source = generate(connection(3, [1, 3]), [1, 0, 0], 70).bits
        const length = action === 'fixture-failure' ? 4 : 5
        const input = source.slice(0, length)
        const fit = berlekampMasseyTrace(input)
        const predicted = forecast(input, fit.coefficients, fit.length, 64)
        const actual = source.slice(length, length + 64)
        const firstMismatch = predicted.findIndex((bit, index) => bit !== actual[index])
        fixture = `<p><strong>${length}-bit prefix ${input.join('')}:</strong> BM fits L<sub>N</sub> = ${fit.length}, C(D) = ${formatConnection(fit.coefficients)}. ${firstMismatch < 0 ? 'All 64 forecast bits match the original generator, even below 2r = 6.' : `The frozen forecast first fails at offset ${firstMismatch}.`} This is a computed outcome, not a bound-based shortcut.</p>`
        break
      }
      case 'inspect-step': {
        const a = clock(GEFFE.r1, inspectStates.r1), b = clock(GEFFE.r2, inspectStates.r2), c = clock(GEFFE.r3, inspectStates.r3)
        inspectLast = [a.output, b.output, c.output, combine(a.output, b.output, c.output)]
        inspectStates = { r1: a.next, r2: b.next, r3: c.next }; inspectClock++; break
      }
      case 'inspect-new': inspectStates = randomGeffeStates(); inspectClock = 0; inspectLast = null; profile = null; break
      case 'inspect-profile': {
        const prefix = geffeBits(inspectStates, 466)
        const bm = berlekampMasseyTrace(prefix)
        const predicted = forecast(prefix, bm.coefficients, bm.length, 64)
        const actual = geffeBits(inspectStates, 530).slice(466)
        profile = { prefix, complexity: bm.length, predicted, actual }; break
      }
      case 'attack-new': retireAttack(); geffeOriginal = randomGeffeStates(); geffeCapture = geffeBits(geffeOriginal, 300); break
      case 'attack-fixture': startAttack(true); break
      case 'attack-run': if (!working) startAttack(false); break
      case 'attack-cancel': retireAttack(); workerProgress = 'Scan cancelled. No recovery verdict was issued.'; break
      case 'attack-verify': {
        if (!geffeRun?.result.prediction || !geffeOriginal) break
        const run = geffeRun
        const frozen = run.result.prediction!
        run.actual = geffeBits(geffeOriginal, run.input.length + frozen.length).slice(run.input.length)
        run.matched = frozen.every((bit, index) => bit === run.actual![index])
        geffeCapture = [...run.input, ...run.actual]
        break
      }
      case 'attack-confirm': {
        if (!geffeRun?.actual || !geffeOriginal || geffeRun.result.survivors.length !== 1) break
        const candidate = geffeRun.result.survivors[0]
        geffeRun.statesConfirmed = (['r1', 'r2', 'r3'] as const).every(key => packedToState(candidate[key], geffeOriginal![key].length).every((bit, index) => bit === geffeOriginal![key][index]))
        break
      }
      case 'attack-complexity': {
        if (!geffeRun || !geffeOriginal) break
        const later = geffeBits(geffeOriginal, 466)
        geffeRun.inspectionLength = later.length
        geffeRun.inspectedComplexity = berlekampMasseyTrace(later).length
        geffeRun.truthTableChecks = ([0, 1] as Bit[]).flatMap(x1 => ([0, 1] as Bit[]).flatMap(x2 => ([0, 1] as Bit[]).map(x3 => Number(combine(x1, x2, x3) === (x2 ? x1 : x3))))).reduce((sum, value) => sum + value, 0)
        geffeRun.measuredPeriods = [period(GEFFE.r1, packedToState(1, 7)), period(GEFFE.r2, packedToState(1, 11)), period(GEFFE.r3, packedToState(1, 13))]
        break
      }
    }
  } catch (error) { manualError = error instanceof Error ? error.message : String(error) }
  document.querySelector<HTMLButtonElement>('[data-act="attack-cancel"]')!.disabled = !working
  renderAll()
})

root.addEventListener('input', event => {
  if ((event.target as HTMLElement).id === 'manual-input') manualDraft = (event.target as HTMLTextAreaElement).value
})

freshHidden()
renderAll()
