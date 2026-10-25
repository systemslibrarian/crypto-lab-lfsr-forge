import { analyzeBoolean, BOOLEAN_PRESETS, inputBits, maskLabel, subsetLabel, type BooleanPresetKey } from './analysis'
import { deterministicAttackFixture, fitParityModel, packedToRegister, type ParityModel, type RankedPair, type RankedState, type ScanResult } from './attacks'
import type { Bit } from '../lfsr/lfsr'

type Scan = ScanResult<RankedState> | ScanResult<RankedPair>
type AttackKind = 'single' | 'pair' | 'parity'

const safe = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
const same = (left: readonly number[], right: readonly number[]) => left.length === right.length && left.every((value, index) => value === right[index])
const verdict = (tone: string, label: string, detail: string) => `<div class="verdict ${tone}" data-verdict="${safe(label)}"><strong>${safe(label)}</strong><p>${safe(detail)}</p></div>`

export function mountBooleanPanel(before: HTMLElement): void {
  const panel = document.createElement('section')
  panel.className = 'panel'
  panel.id = 'panel-boolean'
  panel.innerHTML = `<div class="panel-head"><span class="number">07</span><div><h2>Audit a Boolean combiner</h2><p>Compute exact four-input criteria, then execute three counterexamples.</p></div></div>
    <p>This exhibit is deliberately bounded to exactly four inputs and all 16 rows. It computes the algebraic normal form (ANF), degree, full Walsh spectrum, balance, nonlinearity, correlation immunity, resiliency, and algebraic immunity without sampling. The statistical meanings of Walsh correlation and fixed-subset independence assume independent uniform input bits; the later LFSR scores are separate empirical measurements.</p>
    <div class="card" id="bool-table-card"><h3>1. Edit all 16 outputs</h3>
      <label for="bool-preset">Worked function</label><select id="bool-preset"><option value="custom">Custom table</option>${Object.entries(BOOLEAN_PRESETS).map(([key, preset]) => `<option value="${key}">${safe(preset.label)}</option>`).join('')}</select>
      <p class="small">Row index = x1 + 2x2 + 4x3 + 8x4. Toggle any output; every result below is recomputed from the displayed table.</p>
      <div id="bool-truth"></div><div id="bool-metrics" aria-live="polite"></div>
    </div>
    <div class="card" id="bool-proof-card"><h3>2. Check independence and annihilators</h3>
      <label for="bool-subset">Fixed input subset</label><select id="bool-subset"></select>
      <div id="bool-restrictions"></div><div id="bool-ai"></div>
    </div>
    <div class="card" id="bool-attacks-card"><h3>3. Break one-metric arguments</h3>
      <p>Each button loads its named truth table and a reproducible four-register fixture. The worker receives copied output and a fixed public profile only. The controller keeps the original state for a separate comparison.</p>
      <p class="small">Public profile: R1 degree 3, C(D)=1+D+D³; R2 degree 4, 1+D+D⁴; R3 degree 5, 1+D²+D⁵; R4 degree 7, 1+D+D⁷. Each scan tries every nonzero state in its named register(s), with state[0] output before the clock. Captures start at clock zero: worker scans use either 1 or 300 consecutive combiner bits, while the separate parity fit uses 38 observed bits and checks 64 held-out bits.</p>
      <div class="actions"><button id="bool-single">AI 2: scan one register</button><button id="bool-pair">Resilient: scan a pair</button><button id="bool-parity">Parity: fit recurrence</button><button id="bool-tie" class="secondary">One-bit ambiguity</button><button id="bool-cancel" class="secondary" disabled>Cancel scan</button></div>
      <div id="bool-attack" aria-live="polite"></div>
      <details><summary>Assumptions, limits, and primary sources</summary><ul>
        <li>These scans exhaust 127 R4 states or 7 × 15 R1/R2 pairs at tiny public degrees. They demonstrate exploitable correlations, but do not implement or measure a production <a href="https://doi.org/10.1007/BF02252874">Meier–Staffelbach fast correlation attack (1989)</a>.</li>
        <li>Correlation immunity is checked twice: zero Walsh coefficients at masks of bounded weight, and equal conditional output distributions after fixing every subset assignment, following <a href="https://doi.org/10.1109/18.6037">Xiao and Massey (1988)</a>. Resiliency additionally requires balance.</li>
        <li>The displayed Siegenthaler check uses the universal relation t + degree ≤ 4 for this bounded table; see <a href="https://doi.org/10.1109/TIT.1984.1056949">Siegenthaler (1984)</a>.</li>
        <li>This page reports algebraic degree 0 for either constant function; some algebra texts instead assign the zero polynomial degree −∞.</li>
        <li>The annihilator search checks every nonzero polynomial of degree at most two against both f and 1+f. Algebraic immunity is at most ⌈n/2⌉, so this is complete for n = 4; see <a href="https://doi.org/10.1109/TIT.2006.876253">Carlet, Dalai, Gupta, and Maitra (2006)</a>. High algebraic immunity does not exclude low-degree nonzero multiples fg = h; see <a href="https://www.iacr.org/archive/eurocrypt2004/30270469/finaleurocr.pdf">Meier, Pasalic, and Carlet (EUROCRYPT 2004)</a>.</li>
        <li>All register lengths, captures, and work factors here are toy bounds. A tie or no leading candidate is only this finite experiment's outcome, never a security certificate.</li>
      </ul></details>
    </div>`
  before.before(panel)

  const node = <T extends HTMLElement>(id: string) => panel.querySelector<T>(`#${id}`)!
  let truth = [...BOOLEAN_PRESETS.resilient.truth]
  let subsetMask = 1
  let worker: Worker | null = null
  let epoch = 0
  let working = false
  let attackKind: AttackKind | null = null
  let attackObserved: Bit[] = []
  let attackResult: Scan | ParityModel | null = null
  let attackActual: Bit[] | null = null
  let compared: boolean | null = null
  let attackMessage = 'Choose a counterexample. No result is a general security verdict.'

  const presetKey = (): BooleanPresetKey | null => (Object.keys(BOOLEAN_PRESETS) as BooleanPresetKey[]).find(key => same(truth, BOOLEAN_PRESETS[key].truth)) ?? null

  function stopWorker(): void {
    epoch++
    worker?.terminate()
    worker = null
    working = false
    node<HTMLButtonElement>('bool-cancel').disabled = true
  }

  function retire(reason: string): void {
    stopWorker()
    attackKind = null
    attackObserved = []
    attackResult = null
    attackActual = null
    compared = null
    attackMessage = reason
  }

  function renderTruth(): void {
    const selected = presetKey()
    node<HTMLSelectElement>('bool-preset').value = selected ?? 'custom'
    node('bool-truth').innerHTML = `<div class="table-wrap" tabindex="0"><table class="bool-table"><caption>Editable truth table in row-index order</caption><thead><tr><th scope="col">row</th><th scope="col">x1</th><th scope="col">x2</th><th scope="col">x3</th><th scope="col">x4</th><th scope="col">f</th></tr></thead><tbody>${truth.map((output, row) => `<tr><th scope="row">${row}</th>${inputBits(row).map(bit => `<td>${bit}</td>`).join('')}<td><button type="button" class="bool-output" data-row="${row}" aria-label="Toggle output for row ${row}" aria-pressed="${output === 1}">${output}</button></td></tr>`).join('')}</tbody></table></div>`
  }

  function renderAnalysis(): void {
    const result = analyzeBoolean(truth)
    const maximum = Math.max(...result.walsh.map(Math.abs))
    const relation = result.correlationImmunity + result.degree <= 4
    node('bool-metrics').innerHTML = `<p class="mono" data-bool="anf">ANF: <strong>${safe(result.anfExpression)}</strong></p>
      <div class="bool-metrics"><div><span>weight</span><strong data-bool="weight">${result.weight}/16</strong></div><div><span>balanced</span><strong data-bool="balanced">${result.balanced ? 'yes' : 'no'}</strong></div><div><span>degree</span><strong data-bool="degree">${result.degree}</strong></div><div><span>nonlinearity</span><strong data-bool="nonlinearity">${result.nonlinearity}</strong></div><div><span>CI order</span><strong data-bool="ci">${result.correlationImmunity}</strong></div><div><span>resiliency</span><strong data-bool="resiliency">${result.resiliency ?? 'not balanced'}</strong></div><div><span>max |W|</span><strong data-bool="max-walsh">${maximum}</strong></div></div>
      <p>Siegenthaler relation: t + degree = ${result.correlationImmunity} + ${result.degree} = <strong>${result.correlationImmunity + result.degree}</strong> ≤ 4: <strong>${relation ? 'satisfied' : 'internal inconsistency'}</strong>.</p>
      <details><summary>Full 16-coefficient Walsh spectrum</summary><div class="table-wrap" tabindex="0"><table><caption>Wf(a) = Σx (−1)^(f(x) ⊕ a·x)</caption><thead><tr><th scope="col">mask a</th><th scope="col">linear form</th><th scope="col">Wf(a)</th><th scope="col">Pr[f = a·x]</th></tr></thead><tbody>${result.walsh.map((coefficient, mask) => `<tr data-walsh="${mask}"><th scope="row">${inputBits(mask).join('')}</th><td>${safe(maskLabel(mask))}</td><td>${coefficient}</td><td>${((16 + coefficient) * 100 / 32).toFixed(1)}%</td></tr>`).join('')}</tbody></table></div></details>`

    const options = Array.from({ length: 15 }, (_, index) => index + 1).map(mask => `<option value="${mask}"${mask === subsetMask ? ' selected' : ''}>${safe(subsetLabel(mask))}</option>`).join('')
    node<HTMLSelectElement>('bool-subset').innerHTML = options
    const rows = result.restrictions.filter(entry => entry.subsetMask === subsetMask)
    const subsetSize = inputBits(subsetMask).reduce<number>((sum, bit) => sum + bit, 0)
    node('bool-restrictions').innerHTML = `<p>Fixing every assignment to ${safe(subsetLabel(subsetMask))}: independence requires every slice to contain weight / 2^${subsetSize} = ${result.weight}/${2 ** subsetSize} ones. Counts use the truth table directly, independently of the Walsh transform.</p><div class="table-wrap" tabindex="0"><table><thead><tr><th scope="col">fixed assignment</th><th scope="col">ones / rows</th><th scope="col">same distribution?</th></tr></thead><tbody>${rows.map(entry => `<tr><th scope="row">${entry.fixedVariables.map((variable, index) => `x${variable + 1}=${entry.assignment[index]}`).join(', ')}</th><td>${entry.ones}/${entry.total}</td><td>${entry.independent ? 'yes' : 'no'}</td></tr>`).join('')}</tbody></table></div>${verdict(result.checksAgree ? 'good' : 'failure', result.checksAgree ? 'WALSH / RESTRICTION CHECKS AGREE' : 'INDEPENDENT CHECK DISAGREES', `Both methods report correlation-immunity order ${result.correlationImmunity}.`)}`

    const ai = result.algebraicImmunity
    node('bool-ai').innerHTML = `<h4>Complete degree-≤2 annihilator search</h4><p>Algebraic immunity = <strong data-bool="ai">${ai.degree}</strong>. Executed <strong data-bool="ai-count">${ai.candidatesTotal}</strong> candidate-side checks: all ${ai.candidatesPerSide} nonzero polynomials against f and the same ${ai.candidatesPerSide} against 1+f. The lowest witness is g = <strong data-bool="ai-witness">${safe(ai.witness.expression)}</strong> on the ${ai.witness.side} side.</p><div class="compare"><div><span>g(x), rows 0–15</span><code class="bits" data-bool="ai-values">${ai.witness.values.join('')}</code></div><div><span>pointwise product</span><code class="bits" data-bool="ai-product">${ai.witness.product.join('')}</code></div></div><p class="small">The all-zero product is checked point by point. g is nonzero; the zero polynomial is never a candidate.</p>`
  }

  function renderAttack(): void {
    const target = node('bool-attack')
    if (!attackKind || !attackResult) {
      target.innerHTML = `<p class="muted">${safe(working ? 'Bounded worker scan in progress…' : attackMessage)}</p>`
      return
    }
    if (attackKind === 'parity') {
      const model = attackResult as ParityModel
      target.innerHTML = `<p class="mono">Parity fixture · capture ${model.observed.length} bits · fitted L = <strong data-bool="parity-L">${model.length}</strong></p><p>Parity has balance, order-3 correlation immunity, and zero nonlinearity. BM fits an equivalent recurrence; it does not identify the four component states.</p><code class="bits" data-bool="parity-prediction">${model.prediction.join('')}</code>${compared === null ? '<button id="bool-compare">Reveal and compare next 64 bits</button>' : verdict(compared ? 'alarm' : 'failure', compared ? 'NEXT 64 BITS PREDICTED' : 'PREDICTION FAILED', compared ? 'The frozen equivalent recurrence matched the separately generated continuation.' : 'The frozen prediction did not match.')}`
      return
    }
    if (attackKind === 'single') {
      const result = attackResult as ScanResult<RankedState>
      const unique = result.leaders.length === 1
      target.innerHTML = `<p class="mono">R4 states scored ${result.ranking.length} · capture ${attackObserved.length} · bit comparisons <strong data-bool="work">${result.bitComparisons}</strong></p><p>The truth table has algebraic immunity 2, the maximum possible here, yet Wf(x4) = 8: under independent uniform inputs f agrees with x4 with probability 75%. The deterministic LFSR score below is measured, not assumed to equal 75%.</p>${rankingTable(result.ranking.slice(0, 5), candidate => packedToRegister(candidate.packed, 7).join(''), candidate => `${candidate.matches}/${candidate.total}`)}${unique ? verdict('neutral', 'ONE LEADING STATE', 'The top score is provisional until the controller compares the hidden state.') : verdict('neutral', 'AMBIGUOUS — STOP', `${result.leaders.length} states share the top score; no state is selected.`)}${unique && compared === null ? '<button id="bool-compare">Compare original R4 state</button>' : ''}${compared !== null ? verdict(compared ? 'alarm' : 'failure', compared ? 'R4 STATE CONFIRMED' : 'R4 STATE DID NOT MATCH', 'The controller performed a separate state comparison.') : ''}`
      return
    }
    const result = attackResult as ScanResult<RankedPair>
    const unique = result.leaders.length === 1
    target.innerHTML = `<p class="mono">R1/R2 pairs scored ${result.ranking.length} · capture ${attackObserved.length} · bit comparisons <strong data-bool="work">${result.bitComparisons}</strong></p><p>The function is balanced and first-order correlation immune, so every single-input Walsh coefficient is zero. Wf(x1 ⊕ x2) = 8 still gives a 75% order-two relation under independent uniform inputs; this exhaustive pair scan measures it on the deterministic fixture.</p>${rankingTable(result.ranking.slice(0, 5), candidate => `${packedToRegister(candidate.left, 3).join('')} / ${packedToRegister(candidate.right, 4).join('')}`, candidate => `${candidate.matches}/${candidate.total}`)}${unique ? verdict('neutral', 'ONE LEADING PAIR', 'The top score is provisional until the controller compares both hidden states.') : verdict('neutral', 'AMBIGUOUS — STOP', `${result.leaders.length} pairs share the top score; no pair is selected.`)}${unique && compared === null ? '<button id="bool-compare">Compare original R1/R2 states</button>' : ''}${compared !== null ? verdict(compared ? 'alarm' : 'failure', compared ? 'R1/R2 STATES CONFIRMED' : 'R1/R2 STATES DID NOT MATCH', 'The controller performed a separate two-state comparison.') : ''}`
  }

  function rankingTable<T>(ranking: T[], state: (entry: T) => string, score: (entry: T) => string): string {
    return `<div class="table-wrap" tabindex="0"><table><thead><tr><th scope="col">rank</th><th scope="col">candidate state at clock 0</th><th scope="col">matches</th></tr></thead><tbody>${ranking.map((entry, index) => `<tr><th scope="row">${index + 1}</th><td>${state(entry)}</td><td>${score(entry)}</td></tr>`).join('')}</tbody></table></div>`
  }

  function render(): void { renderTruth(); renderAnalysis(); renderAttack() }

  function loadPreset(key: BooleanPresetKey): void {
    truth = [...BOOLEAN_PRESETS[key].truth]
  }

  function startScan(kind: 'single' | 'pair', count: number): void {
    stopWorker()
    loadPreset(kind === 'single' ? 'correlated' : 'resilient')
    attackKind = kind
    attackObserved = deterministicAttackFixture(kind, count)
    attackResult = null
    attackActual = null
    compared = null
    working = true
    attackMessage = 'Bounded worker scan in progress…'
    const runId = epoch
    worker = new Worker(new URL('./attack.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<{ kind: string; runId: number; result?: Scan; message?: string }>) => {
      const message = event.data
      if (message.runId !== epoch) return
      worker?.terminate(); worker = null; working = false
      node<HTMLButtonElement>('bool-cancel').disabled = true
      if (message.kind === 'result' && message.result) attackResult = message.result
      else { attackKind = null; attackMessage = message.message ?? 'Worker failed; no verdict was issued.' }
      render()
    }
    worker.onerror = () => { if (runId !== epoch) return; stopWorker(); attackKind = null; attackMessage = 'Worker failed; no verdict was issued.'; render() }
    worker.postMessage({ kind: 'run', runId, attack: kind, observed: [...attackObserved] })
    node<HTMLButtonElement>('bool-cancel').disabled = false
    render()
  }

  function startParity(): void {
    stopWorker()
    loadPreset('parity')
    const full = deterministicAttackFixture('parity', 102)
    attackKind = 'parity'
    attackObserved = full.slice(0, 38)
    attackActual = full.slice(38)
    attackResult = fitParityModel(attackObserved)
    compared = null
    attackMessage = ''
    render()
  }

  panel.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button')
    if (!button) return
    if (button.classList.contains('bool-output')) {
      const row = Number(button.dataset.row)
      truth[row] = (1 ^ truth[row]) as Bit
      retire('Truth table changed; the prior attack result was retired.')
      render()
      panel.querySelector<HTMLButtonElement>(`.bool-output[data-row="${row}"]`)?.focus()
      return
    }
    if (button.id === 'bool-single') startScan('single', 300)
    else if (button.id === 'bool-pair') startScan('pair', 300)
    else if (button.id === 'bool-tie') startScan('single', 1)
    else if (button.id === 'bool-parity') startParity()
    else if (button.id === 'bool-cancel') { stopWorker(); attackKind = null; attackResult = null; attackMessage = 'Scan cancelled. No candidate verdict was issued.'; render() }
    else if (button.id === 'bool-compare' && attackResult) {
      if (attackKind === 'single') compared = (attackResult as ScanResult<RankedState>).leaders.length === 1 && (attackResult as ScanResult<RankedState>).leaders[0].packed === 1
      else if (attackKind === 'pair') { const leader = (attackResult as ScanResult<RankedPair>).leaders[0]; compared = (attackResult as ScanResult<RankedPair>).leaders.length === 1 && leader.left === 1 && leader.right === 1 }
      else if (attackKind === 'parity') compared = same((attackResult as ParityModel).prediction, attackActual ?? [])
      renderAttack()
    }
  })

  node<HTMLSelectElement>('bool-preset').addEventListener('change', event => {
    const key = (event.target as HTMLSelectElement).value
    if (key === 'custom') return
    loadPreset(key as BooleanPresetKey)
    retire('Preset changed; the prior attack result was retired.')
    render()
  })
  node<HTMLSelectElement>('bool-subset').addEventListener('change', event => { subsetMask = Number((event.target as HTMLSelectElement).value); renderAnalysis() })
  window.addEventListener('pagehide', stopWorker)
  render()
}
