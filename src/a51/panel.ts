import type { Bit } from '../lfsr/lfsr'
import {
  A51_REGISTER_ORDER,
  A51_REGISTERS,
  BGW_SOURCE,
  BGW_VECTOR,
  clockA51,
  runBgwVector,
  stateHex,
  type A51ClockMode,
  type A51State,
  type A51Step,
} from './a51'
import {
  A51_COMPLETIONS,
  A51_GUESS_POSITIONS,
  A51_RECOVERY_FIXTURE,
  disclosureFor,
  fixtureHeldout,
  fixtureObservation,
  type CompletionResult,
  type DisclosedState,
} from './recovery'

export const A51_SCOPE_CLAIM = 'This fixture-specific lesson assumes an aligned 32-bit known keystream and extraordinary leakage of 52 exact post-warm-up state bits, then guesses the other 12 state bits. It is not a published A5/1 attack, does not recover the 64-bit session key, and does not model modern cellular encryption.'

type Scenario = 'primary' | 'ambiguous' | 'regular' | 'corrupt'
type WorkerReply = Readonly<{
  kind: 'progress' | 'result' | 'error'
  runId: number
  observationsUsed?: number
  candidates?: number
  totalObservations?: number
  result?: CompletionResult
  message?: string
}>

const safe = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
const verdict = (tone: string, label: string, detail: string) => `<div class="verdict ${tone}" data-verdict="${safe(label)}"><strong>${safe(label)}</strong><p>${safe(detail)}</p></div>`
const sameState = (left: A51State, right: A51State) => A51_REGISTER_ORDER.every(register => left[register] === right[register])
const bits = (values: readonly number[]) => values.join('')
const codeBits = (code: number) => code.toString(2).padStart(12, '0').split('').reverse().join('')

function isBitArray(value: unknown): value is readonly Bit[] {
  return Array.isArray(value) && value.every(bit => bit === 0 || bit === 1)
}
function isWorkerReply(value: unknown): value is WorkerReply {
  if (!value || typeof value !== 'object') return false
  const reply = value as Record<string, unknown>
  if (!Number.isInteger(reply.runId) || !['progress', 'result', 'error'].includes(String(reply.kind))) return false
  if (reply.kind === 'progress') return Number.isInteger(reply.observationsUsed) && Number.isInteger(reply.candidates) && Number.isInteger(reply.totalObservations)
  if (reply.kind === 'error') return typeof reply.message === 'string'
  const result = reply.result as Record<string, unknown> | undefined
  if (!result || (result.model !== 'majority' && result.model !== 'regular') || !isBitArray(result.observations)) return false
  if (!Array.isArray(result.counts) || !result.counts.every(count => Number.isInteger(count) && Number(count) >= 0)) return false
  if (!Number.isInteger(result.bitComparisons) || result.completions !== A51_COMPLETIONS || !Array.isArray(result.candidates) || result.candidates.length > A51_COMPLETIONS) return false
  return result.candidates.every(candidate => {
    if (!candidate || typeof candidate !== 'object') return false
    const item = candidate as Record<string, unknown>
    const start = item.start as Record<string, unknown> | undefined
    return Number.isInteger(item.code) && Number(item.code) >= 0 && Number(item.code) < A51_COMPLETIONS && !!start && A51_REGISTER_ORDER.every(register => Number.isInteger(start[register]) && Number(start[register]) >= 0 && Number(start[register]) <= A51_REGISTERS[register].mask) && isBitArray(item.prediction) && item.prediction.length === 32
  })
}
function maskedRegister(disclosed: DisclosedState, register: keyof DisclosedState): string {
  return [...disclosed[register]].reverse().map(bit => bit === null ? '?' : bit).join('')
}

function stateRows(state: A51State): string {
  return A51_REGISTER_ORDER.map(register => {
    const profile = A51_REGISTERS[register]
    return `<tr><th scope="row">${register.toUpperCase()}</th><td>${profile.length}</td><td>${profile.taps.join(', ')}</td><td>${profile.clockBit}</td><td>${profile.outputBit}</td><td><code data-a51="state-${register}">0x${state[register].toString(16).padStart(register === 'r1' ? 5 : 6, '0')}</code></td></tr>`
  }).join('')
}

export function mountA51Panel(before: HTMLElement): void {
  const vector = runBgwVector()
  const vectorChecks = [
    sameState(vector.afterKey, BGW_VECTOR.afterKey),
    sameState(vector.afterCount, BGW_VECTOR.afterCount),
    sameState(vector.keystreamStart, BGW_VECTOR.keystreamStart),
    vector.aToBHex === BGW_VECTOR.aToBHex,
    vector.bToAHex === BGW_VECTOR.bToAHex,
  ]
  const vectorOk = vectorChecks.every(Boolean)
  const disclosed = disclosureFor(A51_RECOVERY_FIXTURE.state)
  const heldout = fixtureHeldout()

  const panel = document.createElement('section')
  panel.className = 'panel'
  panel.id = 'panel-a51'
  panel.innerHTML = `<div class="panel-head"><span class="number">09</span><div><h2>Clock historical A5/1</h2><p>Predict majority advances, then test a bounded post-warm-up state guess.</p></div></div>
    <p>This separately labeled lesson implements the reverse-engineered historical A5/1 definition published by Marc Briceno, Ian Goldberg, and David Wagner. A5/1 is a cryptographically broken legacy design; it is here to contrast regular LFSR clocks with stop/go majority clocking—not as a recommendation for modern cellular encryption.</p>
    <div id="a51-vector" role="status">${verdict(vectorOk ? 'good' : 'failure', vectorOk ? 'HISTORICAL BGW VECTOR PASSED' : 'HISTORICAL BGW VECTOR FAILED', `${vectorChecks.filter(Boolean).length}/5 checks: post-key, post-COUNT, post-100-clock state, and both consecutive 114-bit bursts.`)}</div>
    <details id="a51-checkpoints"><summary>Exact checkpoint and burst values</summary><p class="mono">after 64 Kc bits: <span data-a51="after-key">${stateHex(vector.afterKey)}</span><br>after 22 COUNT bits (the frame's “initial state” in BSW): <span data-a51="after-count">${stateHex(vector.afterCount)}</span><br>after 100 output-disabled majority clocks (keystream start): <span data-a51="after-warmup">${stateHex(vector.keystreamStart)}</span></p><p class="mono">A→B 114 bits, MSB-first packed: <code data-a51="a-to-b">${vector.aToBHex}</code><br>B→A next 114 bits, MSB-first packed: <code data-a51="b-to-a">${vector.bToAHex}</code></p></details>
    <div class="card" id="a51-clock-card"><h3>1. Set up, predict, and clock</h3>
      <p>Fixture Kc = <code>${BGW_VECTOR.keyHex}</code>; 22-bit COUNT input = <code>0x${BGW_VECTOR.count.toString(16)}</code>. All three registers start at zero. The first displayed Kc byte enters first, each byte least-significant bit first; COUNT also enters least-significant bit first. For every key or COUNT bit, all registers clock and then that bit is XORed into bit 0. After 100 output-disabled majority clocks, output generation clocks first and then XORs the three MSBs.</p>
      <p class="small">COUNT is the historical algorithm's 22-bit input. This page does not implement the GSM TDMA T1/T2/T3-to-COUNT conversion. The two 114-bit vector blocks are consecutive; there is no extra 100-clock gap between them.</p>
      <div class="table-wrap" tabindex="0"><table><caption>Distinct register definitions; bit 0 is the rightmost/least-significant bit</caption><thead><tr><th scope="col">register</th><th scope="col">length</th><th scope="col">feedback taps</th><th scope="col">clock bit</th><th scope="col">output bit</th><th scope="col">current state</th></tr></thead><tbody id="a51-state-rows"></tbody></table></div>
      <div id="a51-decision"></div>
      <fieldset><legend>Before clocking, predict which registers match the majority bit</legend><div class="a51-choice">${A51_REGISTER_ORDER.map(register => `<label><input type="checkbox" id="a51-predict-${register}" ${vectorOk ? '' : 'disabled'}> ${register.toUpperCase()} advances</label>`).join('')}</div></fieldset>
      <div class="actions"><button id="a51-check-prediction" ${vectorOk ? '' : 'disabled'}>Check prediction</button><button id="a51-step" disabled>Execute historical majority step</button><button id="a51-regular" class="secondary" disabled>Compare counterfactual regular step</button><button id="a51-reset" class="secondary">Reset historical state</button></div>
      <div id="a51-clock-result" aria-live="polite"></div>
    </div>
    <div class="card" id="a51-recovery-card"><h3>2. Complete 12 hidden state bits</h3>
      <p>The controller starts at the BGW post-100 keystream-start state and discloses 52 of its 64 register bits—extraordinary leakage, not public information. The 12 question marks include all three clock-control bits. The worker enumerates all 2¹² = 4,096 completions, applies the actual irregular clock, and filters against the next 32 observed output bits.</p>
      <div class="a51-mask" role="group" aria-label="Disclosed state bits, most-significant position first">${A51_REGISTER_ORDER.map(register => `<p><strong>${register.toUpperCase()} bit ${A51_REGISTERS[register].length - 1} → bit 0</strong><code class="bits" data-a51="disclosed-${register}">${maskedRegister(disclosed, register)}</code><span>hidden positions: ${A51_GUESS_POSITIONS[register].join(', ')}</span></p>`).join('')}</div>
      <p class="small">The observed 32 bits must already be an aligned known keystream—for XOR encryption, aligned known plaintext and ciphertext can expose it. Candidate-code bit 0 fills R1 bit 0; subsequent code bits fill the listed ascending positions, register by register through R1, R2, and R3. These are 12 state-bit guesses, not 12 session-key bits. The 32-bit continuation is disjoint held-out data, not a claim of statistical independence.</p>
      <div class="actions"><button id="a51-run" ${vectorOk ? '' : 'disabled'}>Run 4,096 irregular completions</button><button id="a51-cancel" class="secondary" disabled>Cancel search</button><button id="a51-heldout" disabled>Check next 32 held-out bits</button><button id="a51-compare" disabled>Compare controller state</button></div>
      <div id="a51-recovery" aria-live="polite"><p class="muted">No state-completion result yet.</p></div>
    </div>
    <div class="card" id="a51-failures-card"><h3>3. Change one assumption</h3>
      <p>Each control reruns the same disclosed-state experiment. Too little output must remain ambiguous; regular clocking is a deliberately wrong model; and a corrupted observation may select a wrong completion until fresh output rejects it.</p>
      <div class="actions"><button id="a51-ambiguous" class="secondary" ${vectorOk ? '' : 'disabled'}>Stop after 16 observed bits</button><button id="a51-wrong-model" class="secondary" ${vectorOk ? '' : 'disabled'}>Assume regular clocking</button><button id="a51-corrupt" class="secondary" ${vectorOk ? '' : 'disabled'}>Flip observation 29</button><button id="a51-failure-cancel" class="secondary" disabled>Cancel failure run</button></div>
      <div id="a51-failure" aria-live="polite"><p class="muted">Choose a failure case.</p></div>
      <div class="negative-claim" data-claim="a51-scope"><strong>BOUNDED ADAPTATION — NOT KEY RECOVERY</strong><p>${safe(A51_SCOPE_CLAIM)}</p></div>
      <details><summary>Historical source, assumptions, and retained limits</summary><ul>
        <li>The implementation and vector are pinned to the <a href="${BGW_SOURCE.url}">1998–1999 Briceno–Goldberg–Wagner pedagogical C source</a>, archived at commit <code>${BGW_SOURCE.commit.slice(0, 12)}</code>; fetched file SHA-256 <code>${BGW_SOURCE.sha256}</code>. Its authors describe a reverse-engineered definition and say their code was checked against official vectors. Independently transcribed tests in this lab reproduce that archived program's published vector; the browser does not compile or run the C, and the lab does not claim access to the nonpublic original specification.</li>
        <li><a href="https://www.etsi.org/deliver/etsi_ts/143000_143099/143020/11.05.00_60/ts_143020v110500p.pdf">ETSI TS 143 020 / 3GPP TS 43.020, Annex C</a> documents the external 64-bit Kc, 22-bit COUNT, and two 114-bit blocks while referring the internal algorithm to the GSM Association-managed specification. That boundary is why this lesson labels its internal definition reverse-engineered rather than public-standard text.</li>
        <li><a href="https://doi.org/10.1007/3-540-44706-7_1">Biryukov, Shamir, and Wagner (FSE 2000)</a> documents the 19/22/23-bit registers, majority rule, setup, and real attacks. It calls the state after key and COUNT but before the 100 mixing clocks the frame's “initial state.” This page instead names its later target the <strong>post-100 keystream-start state</strong>.</li>
        <li>The real published attacks are not this exercise. Here the learner is handed 52 exact post-warm-up state bits and tries only 4,096 completions against one fixed fixture. No session key is derived, no radio capture is processed, and a finite success or failure is not a general security result.</li>
        <li>The counterfactual regular-clock run asks whether the observed fixture fits a different transition model. Rejecting that model is not evidence that majority clocking is secure; irregular clocking by itself is not a security proof.</li>
      </ul></details>
    </div>`
  before.before(panel)

  const node = <T extends HTMLElement>(id: string) => panel.querySelector<T>(`#${id}`)!
  let clockState: A51State = { ...BGW_VECTOR.keystreamStart }
  let clockIndex = 0
  let lastStep: A51Step | null = null
  let prediction: { chosen: boolean[]; correct: boolean } | null = null
  let regularComparison: { majority: A51Step; regular: A51Step } | null = null

  let scenario: Scenario | null = null
  let result: CompletionResult | null = null
  let heldoutCheck: { matches: boolean; mismatchPositions: number[] } | null = null
  let controllerConfirmed: boolean | null = null
  let worker: Worker | null = null
  let working = false
  let sequence = 0
  let activeRunId = 0
  let activeFingerprint = ''
  let statusMessage = ''

  function renderClock(): void {
    const decision = clockA51(clockState)
    node('a51-state-rows').innerHTML = stateRows(clockState)
    node('a51-decision').innerHTML = `<p class="mono">Historical clocks executed: <strong data-a51="clock-index">${clockIndex}</strong> · pre-clock control bits R1/R2/R3 = <strong data-a51="clock-bits">${decision.clockBits.join(' / ')}</strong> · majority = <strong data-a51="majority">${decision.majority}</strong>.</p><p>Select the registers whose displayed control bit matches the majority. The historical output is read only after those registers advance.</p>`
    let html = ''
    if (prediction) html += verdict(prediction.correct ? 'good' : 'failure', prediction.correct ? 'MAJORITY PREDICTION MATCHED' : 'PREDICTION DID NOT MATCH', `Chosen advances: ${prediction.chosen.map((advance, index) => advance ? A51_REGISTER_ORDER[index].toUpperCase() : '').filter(Boolean).join(' + ') || 'none'}. Historical rule advances ${decision.advanced.map((advance, index) => advance ? A51_REGISTER_ORDER[index].toUpperCase() : '').filter(Boolean).join(' + ')}.`)
    if (lastStep) html += `<p class="mono">Executed advances <strong data-a51="advances">${lastStep.advanced.map((advance, index) => advance ? A51_REGISTER_ORDER[index].toUpperCase() : '').filter(Boolean).join(' + ')}</strong> · output bit <strong data-a51="step-output">${lastStep.output}</strong> · next state <strong data-a51="step-state">${stateHex(lastStep.next)}</strong>.</p>`
    if (regularComparison) html += `<div class="compare"><div><span>Historical majority step</span><code data-a51="majority-next">${stateHex(regularComparison.majority.next)}</code><p>advances ${regularComparison.majority.advanced.map((advance, index) => advance ? A51_REGISTER_ORDER[index].toUpperCase() : '').filter(Boolean).join(' + ')} · output ${regularComparison.majority.output}</p></div><div><span>Counterfactual regular step</span><code data-a51="regular-next">${stateHex(regularComparison.regular.next)}</code><p>advances R1 + R2 + R3 · output ${regularComparison.regular.output}</p></div></div>${verdict('neutral', 'COUNTERFACTUAL ONLY', 'The regular result uses a copy of the pre-clock state and does not alter the historical walkthrough.')}`
    node('a51-clock-result').innerHTML = html || '<p class="muted">Make a prediction or execute a comparison.</p>'
    node<HTMLButtonElement>('a51-step').disabled = !vectorOk || !prediction
    node<HTMLButtonElement>('a51-regular').disabled = !vectorOk || !prediction
  }

  function countsTable(recovery: CompletionResult): string {
    return `<div class="table-wrap a51-counts-wrap" tabindex="0"><table class="a51-counts"><caption>Candidate completions after each observed bit</caption><thead><tr><th scope="col">observation used</th><th scope="col">survivors</th></tr></thead><tbody>${recovery.counts.map((count, index) => `<tr><th scope="row">${index === 0 ? 'before output' : index}</th><td>${count}</td></tr>`).join('')}</tbody></table></div>`
  }

  function renderRecovery(): void {
    node<HTMLButtonElement>('a51-cancel').disabled = !(working && scenario === 'primary')
    node<HTMLButtonElement>('a51-heldout').disabled = scenario !== 'primary' || result?.candidates.length !== 1 || !!heldoutCheck || working
    node<HTMLButtonElement>('a51-compare').disabled = !heldoutCheck?.matches || controllerConfirmed !== null || working
    if (scenario !== 'primary' || !result) {
      node('a51-recovery').innerHTML = `<p class="muted">${safe(scenario === 'primary' ? statusMessage : 'No state-completion result yet.')}</p>`
      return
    }
    const candidate = result.candidates.length === 1 ? result.candidates[0] : undefined
    const firstUnique = result.counts.findIndex(count => count === 1)
    let verification = ''
    if (heldoutCheck && candidate) {
      verification = `<h4>Disjoint held-out continuation</h4><div class="compare"><div><span>controller-held next 32 bits</span><code class="bits" data-a51="heldout-actual">${bits(heldout)}</code></div><div><span>frozen candidate prediction</span><code class="bits" data-a51="heldout-prediction">${bits(candidate.prediction)}</code></div></div>${verdict(heldoutCheck.matches ? 'good' : 'failure', heldoutCheck.matches ? 'HELD-OUT CONTINUATION MATCHED' : 'HELD-OUT CONTINUATION REJECTED CANDIDATE', heldoutCheck.matches ? 'All 32 disjoint continuation bits matched the frozen prediction.' : `Mismatches at one-based held-out positions ${heldoutCheck.mismatchPositions.join(', ')}.`)}`
    }
    node('a51-recovery').innerHTML = `<p class="mono">Model <strong>historical majority clocking</strong> · observations 32 · completions <strong data-a51="completions">${result.completions}</strong> · executed bit comparisons <strong data-a51="comparisons">${result.bitComparisons}</strong>.</p>${countsTable(result)}<p>First unique after one-based observation <strong data-a51="first-unique">${firstUnique < 0 ? 'not reached' : firstUnique}</strong>. ${candidate ? `Frozen candidate code <strong data-a51="candidate-code">${candidate.code}</strong> (guess bits <code data-a51="candidate-bits">${codeBits(candidate.code)}</code>); post-100 state <code data-a51="candidate-state">${stateHex(candidate.start)}</code>.` : ''}</p>${candidate ? verdict('neutral', 'ONE PROVISIONAL STATE COMPLETION', 'The 32 observed bits leave one completion; fresh held-out output and a separate controller comparison are still required.') : verdict('neutral', result.candidates.length ? 'AMBIGUOUS — STOP' : 'NO COMPLETION — STOP', `${result.candidates.length} candidates remain.`)}${verification}${controllerConfirmed !== null ? verdict(controllerConfirmed ? 'alarm' : 'failure', controllerConfirmed ? 'POST-100 STATE CONFIRMED' : 'CONTROLLER STATE DID NOT MATCH', 'The controller compared all 64 recovered state bits separately after held-out verification.') : ''}`
  }

  function renderFailure(): void {
    node<HTMLButtonElement>('a51-failure-cancel').disabled = !(working && scenario !== 'primary')
    if (!scenario || scenario === 'primary' || !result) {
      node('a51-failure').innerHTML = `<p class="muted">${safe(scenario && scenario !== 'primary' ? statusMessage : 'Choose a failure case.')}</p>`
      return
    }
    if (scenario === 'ambiguous') {
      node('a51-failure').innerHTML = `<p class="mono">Only 16 observed bits · survivors <strong data-a51="ambiguous-count">${result.candidates.length}</strong> · comparisons ${result.bitComparisons}.</p>${countsTable(result)}${verdict('neutral', 'AMBIGUOUS — STOP', 'Eleven completions remain. The lesson does not select one or compare controller state.')}`
      return
    }
    if (scenario === 'regular') {
      node('a51-failure').innerHTML = `<p class="mono">Counterfactual regular clock · survivor progression <strong data-a51="regular-counts">${result.counts.slice(0, 3).join(' → ')}</strong> · comparisons <strong data-a51="regular-comparisons">${result.bitComparisons}</strong>.</p>${verdict('failure', 'REGULAR MODEL REJECTED', 'No completion survives the first two observed bits under the clock-all-registers model. This rejects that model for the fixture; it is not a security comparison.')}`
      return
    }
    const candidate = result.candidates[0]
    const mismatchPositions = candidate?.prediction.flatMap((bit, index) => bit === heldout[index] ? [] : [index + 1]) ?? []
    node('a51-failure').innerHTML = `<p class="mono">Flipped one-based observed bit <strong data-a51="corrupt-index">${A51_RECOVERY_FIXTURE.corruptedOneBased}</strong> · provisional candidate code <strong data-a51="corrupt-code">${candidate?.code ?? 'none'}</strong> · comparisons ${result.bitComparisons}.</p>${candidate ? `<div class="compare"><div><span>controller-held next 32 bits</span><code class="bits" data-a51="corrupt-actual">${bits(heldout)}</code></div><div><span>wrong candidate prediction</span><code class="bits" data-a51="corrupt-prediction">${bits(candidate.prediction)}</code></div></div><p>Mismatching one-based held-out positions: <strong data-a51="corrupt-mismatches">${mismatchPositions.join(', ')}</strong>.</p>${verdict('failure', `HELD-OUT CONTINUATION REJECTED ${candidate.code}`, `A corrupted observed prefix selected one completion, but ${mismatchPositions.length} fresh continuation bits disagree. No recovery verdict is issued.`)}` : verdict('neutral', 'NO COMPLETION — STOP', 'The corrupted observation left no candidate.')}`
  }

  function renderSearch(): void { renderRecovery(); renderFailure() }

  function invalidateWorker(message = ''): void {
    if (worker) {
      try { worker.postMessage({ kind: 'cancel', runId: activeRunId }) } catch { /* A terminated or test-double worker is already invalidated below. */ }
      worker.terminate()
    }
    worker = null
    working = false
    sequence++
    activeRunId = sequence
    activeFingerprint = ''
    if (message) statusMessage = message
  }

  function beginScenario(nextScenario: Scenario): void {
    invalidateWorker()
    scenario = nextScenario
    result = null
    heldoutCheck = null
    controllerConfirmed = null
    const model: A51ClockMode = nextScenario === 'regular' ? 'regular' : 'majority'
    const observed = nextScenario === 'corrupt' ? fixtureObservation(true) : fixtureObservation().slice(0, nextScenario === 'ambiguous' ? 16 : 32)
    const fingerprint = `${nextScenario}|${model}|${observed.join('')}|${A51_COMPLETIONS}`
    const runId = ++sequence
    activeRunId = runId
    activeFingerprint = fingerprint
    working = true
    statusMessage = `Starting ${A51_COMPLETIONS.toLocaleString()} state completions…`
    const runWorker = new Worker(new URL('./attack.worker.ts', import.meta.url), { type: 'module' })
    worker = runWorker
    runWorker.onmessage = (event: MessageEvent<unknown>) => {
      if (worker !== runWorker) return
      if (!isWorkerReply(event.data)) {
        if (fingerprint !== activeFingerprint) return
        runWorker.terminate(); worker = null; working = false; result = null; activeFingerprint = ''
        statusMessage = 'Worker returned an invalid message. No state-completion verdict was issued.'
        renderSearch()
        return
      }
      const reply = event.data
      if (reply.runId !== activeRunId || fingerprint !== activeFingerprint) return
      if (reply.kind === 'result' && (!reply.result || reply.result.model !== model || reply.result.observations.join('') !== observed.join('') || reply.result.counts.length !== observed.length + 1)) {
        runWorker.terminate(); worker = null; working = false; result = null; activeFingerprint = ''
        statusMessage = 'Worker result did not match the frozen request. No state-completion verdict was issued.'
        renderSearch()
        return
      }
      if (reply.kind === 'progress') {
        statusMessage = `Observed bits ${reply.observationsUsed} / ${reply.totalObservations}; ${reply.candidates} candidates remain.`
        renderSearch()
        return
      }
      runWorker.terminate(); worker = null; working = false; activeFingerprint = ''
      if (reply.kind === 'result' && reply.result) { result = reply.result; statusMessage = 'Every surviving completion was frozen.' }
      else { result = null; statusMessage = `Search failed: ${reply.message ?? 'unknown worker error'}` }
      renderSearch()
    }
    runWorker.onerror = () => {
      if (worker !== runWorker) return
      if (runId !== activeRunId || fingerprint !== activeFingerprint) return
      runWorker.terminate(); worker = null; working = false; result = null; activeFingerprint = ''
      statusMessage = 'Worker failed. No state-completion verdict was issued.'
      renderSearch()
    }
    runWorker.postMessage({ kind: 'run', runId, disclosed, observed, model })
    renderSearch()
  }

  node('a51-check-prediction').addEventListener('click', () => {
    if (!vectorOk) return
    const chosen = A51_REGISTER_ORDER.map(register => node<HTMLInputElement>(`a51-predict-${register}`).checked)
    const actual = clockA51(clockState).advanced
    prediction = { chosen, correct: chosen.every((advance, index) => advance === actual[index]) }
    regularComparison = null
    renderClock()
  })
  for (const register of A51_REGISTER_ORDER) node(`a51-predict-${register}`).addEventListener('change', () => {
    prediction = null; regularComparison = null
    renderClock()
  })
  node('a51-step').addEventListener('click', () => {
    if (!vectorOk || !prediction) return
    const step = clockA51(clockState)
    clockState = step.next; clockIndex++; lastStep = step; prediction = null; regularComparison = null
    for (const register of A51_REGISTER_ORDER) node<HTMLInputElement>(`a51-predict-${register}`).checked = false
    renderClock()
  })
  node('a51-regular').addEventListener('click', () => {
    if (!vectorOk || !prediction) return
    regularComparison = { majority: clockA51(clockState), regular: clockA51(clockState, 'regular') }
    renderClock()
  })
  node('a51-reset').addEventListener('click', () => {
    clockState = { ...BGW_VECTOR.keystreamStart }; clockIndex = 0; lastStep = null; prediction = null; regularComparison = null
    for (const register of A51_REGISTER_ORDER) node<HTMLInputElement>(`a51-predict-${register}`).checked = false
    renderClock()
  })

  node('a51-run').addEventListener('click', () => beginScenario('primary'))
  node('a51-ambiguous').addEventListener('click', () => beginScenario('ambiguous'))
  node('a51-wrong-model').addEventListener('click', () => beginScenario('regular'))
  node('a51-corrupt').addEventListener('click', () => beginScenario('corrupt'))
  for (const id of ['a51-cancel', 'a51-failure-cancel']) node(id).addEventListener('click', () => {
    const currentScenario = scenario
    invalidateWorker('Search cancelled. No state-completion verdict was issued.')
    scenario = currentScenario; result = null; heldoutCheck = null; controllerConfirmed = null
    renderSearch()
  })
  node('a51-heldout').addEventListener('click', () => {
    const candidate = scenario === 'primary' && result?.candidates.length === 1 ? result.candidates[0] : null
    if (!candidate) return
    const mismatchPositions = candidate.prediction.flatMap((bit, index) => bit === heldout[index] ? [] : [index + 1])
    heldoutCheck = { matches: mismatchPositions.length === 0, mismatchPositions }
    controllerConfirmed = null
    renderSearch()
  })
  node('a51-compare').addEventListener('click', () => {
    const candidate = scenario === 'primary' && heldoutCheck?.matches && result?.candidates.length === 1 ? result.candidates[0] : null
    if (!candidate) return
    controllerConfirmed = sameState(candidate.start, A51_RECOVERY_FIXTURE.state)
    renderSearch()
  })
  window.addEventListener('pagehide', () => invalidateWorker())

  renderClock()
  renderSearch()
}
