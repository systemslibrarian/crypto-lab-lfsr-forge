import {
  AFFINE_CUBES,
  candidateLabels,
  onlineWork,
  runOnline,
  runPreprocessing,
  verifyHeldouts,
  type HeldoutResult,
  type OnlineResult,
  type PreprocessingResult,
} from './analysis'
import { ORACLE_EXPRESSION, cubeVertices, keyLabel, oracleDegree, publicLabel, toyOracle, type ToyKey } from './oracle'

const TEACHING_SECRET: ToyKey = [1, 1, 0]
const controllerOracle = (publicRow: number) => toyOracle(TEACHING_SECRET, publicRow)
const safe = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
const verdict = (tone: string, label: string, detail: string) => `<div class="verdict ${tone}" data-verdict="${safe(label)}"><strong>${safe(label)}</strong><p>${safe(detail)}</p></div>`

export function mountCubePanel(before: HTMLElement): void {
  const panel = document.createElement('section')
  panel.className = 'panel'
  panel.id = 'panel-cube'
  panel.innerHTML = `<div class="panel-head"><span class="number">08</span><div><h2>Sum a cube, recover a superpoly</h2><p>Query a tiny GF(2) oracle, keep affine superpolys, and recover a three-bit toy secret.</p></div></div>
    <p>This companion lesson executes the two phases of a cube attack on a deliberately tiny, inspectable oracle. Preprocessing may choose both public inputs and teaching keys to recover each cube's superpoly. Online recovery fixes one controller-held key, varies only public inputs, and treats every returned bit as an oracle observation.</p>
    <div class="card" id="cube-preprocess-card"><h3>1. Exhaust the preprocessing fixture</h3>
      <p class="mono">P(v, k) = ${safe(ORACLE_EXPRESSION)}</p>
      <p>The oracle's computed total ANF degree is <strong data-cube="oracle-degree">${oracleDegree()}</strong>. Bit strings use the order v₁v₂v₃v₄ and k₁k₂k₃. For each two-variable cube, every non-cube public input is fixed to zero; the lab evaluates all four cube assignments for all eight teaching keys, XORs each face, and applies a Möbius transform to the resulting eight-bit truth table.</p>
      <div class="actions"><button id="cube-preprocess">Run exhaustive preprocessing</button></div>
      <div id="cube-preprocess-view" aria-live="polite"><p class="muted">No preprocessing result yet.</p></div>
    </div>
    <div class="card" id="cube-online-card"><h3>2. Query, filter, and verify</h3>
      <p>The online oracle uses a fixed three-bit teaching secret held by the controller. The first action sends exactly the four public vertices of each accepted affine cube; the secret is not rendered or passed as input to the recovery calculation.</p>
      <div class="actions"><button id="cube-online" disabled>Query three affine cubes</button><button id="cube-heldout" disabled>Check four held-out inputs</button><button id="cube-compare" disabled>Compare controller secret</button></div>
      <div id="cube-online-view" aria-live="polite"><p class="muted">Run preprocessing before the online phase.</p></div>
    </div>
    <div class="card" id="cube-limits-card"><h3>3. Make recovery fail honestly</h3>
      <p>These deterministic cases distinguish too few independent equations from a corrupted observation. Neither case is allowed to publish a confirmed secret.</p>
      <div class="actions"><button id="cube-drop" class="secondary" disabled>Drop C24</button><button id="cube-flip" class="secondary" disabled>Flip C13's sum</button></div>
      <div id="cube-failure-view" aria-live="polite"><p class="muted">Run preprocessing to enable the failure cases.</p></div>
      <details><summary>Assumptions, publication note, and Trivium boundary</summary><ul>
        <li>The oracle exposes chosen four-bit public inputs and one output bit. Preprocessing additionally evaluates all eight toy keys. Online work assumes repeated queries under one fixed secret.</li>
        <li>In this lesson, a cube is the complete set of assignments to selected public variables while all other public variables are fixed to zero. XOR over that face cancels every term missing a selected variable. An affine, nonconstant superpoly is a maxterm in the terminology of <a href="https://eprint.iacr.org/2008/385">Dinur and Shamir, ePrint 2008/385</a>.</li>
        <li>C34 is a valid cube. Its recovered superpoly k₁k₂ ⊕ k₃ is nonlinear, so this lesson rejects it only from the affine linear-system recovery; it does not call the cube invalid.</li>
        <li>The paper's introductory polynomial P(v₁, v₂, v₃, x₁, x₂, x₃) (Section 1) includes the terms v₁v₂x₁ + v₁v₂x₃ + v₁v₂, so summing it over v₁, v₂ with v₃ = 0 gives x₁ ⊕ x₃ ⊕ 1; the paper prints that sum as x₁ + x₃, omitting the constant the standalone v₁v₂ term contributes, while its other two printed sums (x₁ + x₂ for v₁ = 0 and x₁ + x₂ + x₃ for v₂ = 0) agree with the displayed polynomial. This lab records that discrepancy, checked against the ePrint PDF on 2026-10-27 and recomputed in its unit tests, and uses its own exhaustively checked oracle instead of silently copying or correcting the publication's fixture.</li>
        <li data-claim="cube-scope"><strong>This is not an attack on Trivium.</strong> This three-secret/four-public oracle executes no Trivium state or round and is not a performance model. The paper reports attacks only on variants reduced to 672, 735, and 767 initialization rounds. Panel 06 separately implements the real cipher and its specified 1,152-round initialization from the <a href="https://cr.yp.to/streamciphers/trivium/desc.pdf">original Trivium specification</a>. Nothing here claims a break of full Trivium.</li>
      </ul></details>
    </div>`
  before.before(panel)

  const node = <T extends HTMLElement>(id: string) => panel.querySelector<T>(`#${id}`)!
  let preprocessing: PreprocessingResult | null = null
  let online: OnlineResult | null = null
  let heldout: HeldoutResult | null = null
  let frozenCandidate: ToyKey | null = null
  let compared: boolean | null = null
  let failure: { kind: 'drop' | 'flip'; online: OnlineResult; heldout?: HeldoutResult } | null = null

  function renderPreprocessing(): void {
    if (!preprocessing) {
      node('cube-preprocess-view').innerHTML = '<p class="muted">No preprocessing result yet.</p>'
      return
    }
    const rows = preprocessing.superpolys.map(result => {
      const status = result.maxterm ? 'affine maxterm — use' : result.affine ? 'valid cube; constant affine superpoly, not a maxterm — exclude from this solve' : 'valid cube; nonlinear, not a maxterm — exclude from this affine solve'
      return `<tr data-cube-row="${result.cube.id}"><th scope="row">${result.cube.id} ${safe(result.cube.variables)}</th><td>${publicLabel(result.cube.publicMask)}</td><td data-cube="${result.cube.id}-superpoly">${safe(result.expression)}</td><td>${result.degree}</td><td>${status}</td></tr>`
    }).join('')
    const exhaustive = preprocessing.superpolys.map(result => {
      const publicRows = cubeVertices(result.cube.publicMask)
      return `<details><summary>${result.cube.id}: all 8 keys × ${publicRows.length} public assignments</summary><div class="table-wrap" tabindex="0"><table><caption>Every oracle evaluation used to recover ${safe(result.expression)}</caption><thead><tr><th scope="col">teaching key</th>${publicRows.map(row => `<th scope="col">v=${publicLabel(row)}</th>`).join('')}<th scope="col">XOR</th></tr></thead><tbody>${result.observations.map(observation => `<tr><th scope="row">${keyLabel(observation.key)}</th>${observation.outputs.map(output => `<td>${output}</td>`).join('')}<td>${observation.sum}</td></tr>`).join('')}</tbody></table></div></details>`
    }).join('')
    const cancellation = preprocessing.superpolys.map(result => `<tr><th scope="row">${result.cube.id}</th><td>${result.survivingTermLabels.join(' ⊕ ')}</td><td>${result.cancelledTermLabels.join(' ⊕ ')}</td><td>${result.zeroedTermLabels.join(' ⊕ ')}</td><td>${safe(result.expression)}</td></tr>`).join('')
    node('cube-preprocess-view').innerHTML = `<p class="mono">Executed <strong data-cube="pre-raw">${preprocessing.rawEvaluations}</strong> raw, nonmemoized oracle evaluations covering <strong data-cube="pre-distinct">${preprocessing.distinctSecretPublicRows}</strong> distinct (secret, public-row) pairs.</p>
      <div class="table-wrap" tabindex="0"><table><caption>Superpolys recovered only from complete cube sums</caption><thead><tr><th scope="col">cube</th><th scope="col">mask v₁v₂v₃v₄</th><th scope="col">recovered superpoly</th><th scope="col">degree</th><th scope="col">decision</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${verdict('good', 'ALL CUBE FACES EXHAUSTED', 'Four cubes × eight teaching keys × four public assignments = 128 evaluated output bits.')}
      <details><summary>Show all 128 preprocessing outputs</summary>${exhaustive}</details>
      <details><summary>Show monomial cancellation</summary><p>Terms using only cube variables but missing at least one selected variable occur an even number of times and cancel. Terms containing any non-cube public variable are zero because those inputs are fixed to zero. The remaining terms contain the complete cube factor.</p><div class="table-wrap" tabindex="0"><table data-cube-table="cancellation"><caption>Why each master-polynomial term survives, cancels, or becomes zero on the cube face</caption><thead><tr><th scope="col">cube</th><th scope="col">surviving master-polynomial terms</th><th scope="col">terms cancelled on the face</th><th scope="col">terms zeroed by fixed inputs</th><th scope="col">after removing cube factor</th></tr></thead><tbody>${cancellation}</tbody></table></div></details>`
  }

  function renderOnline(): void {
    if (!online) {
      node('cube-online-view').innerHTML = `<p class="muted">${preprocessing ? 'Preprocessing is complete. Query the three accepted affine cubes.' : 'Run preprocessing before the online phase.'}</p>`
      return
    }
    const table = online.observations.map(observation => `<tr data-cube-online="${observation.cube.id}"><th scope="row">${observation.cube.id}</th><td>${observation.vertices.map(publicLabel).join(', ')}</td><td>${observation.outputs.join('')}</td><td>${observation.recordedSum}</td><td>${safe(observation.equation.expression)}</td><td>${candidateLabels(observation.candidatesAfter)}</td></tr>`).join('')
    const unique = online.candidates.length === 1
    const provisional = frozenCandidate ? keyLabel(frozenCandidate) : candidateLabels(online.candidates)
    const preWork = onlineWork(online)
    let heldoutBlock = ''
    if (heldout) {
      const check = heldout
      heldoutBlock = `<h4>Independent held-out observations</h4><div class="table-wrap" tabindex="0"><table><caption>Fresh public rows test the frozen candidate before the controller comparison</caption><thead><tr><th scope="col">public v₁v₂v₃v₄</th><th scope="col">hidden-oracle output</th><th scope="col">candidate prediction</th><th scope="col">match</th></tr></thead><tbody>${check.rows.map((row, index) => `<tr><th scope="row">${publicLabel(row)}</th><td>${check.observed[index]}</td><td>${check.predicted[index]}</td><td>${check.matches[index] ? 'yes' : 'no'}</td></tr>`).join('')}</tbody></table></div><p class="mono">Held-out observed bits <strong data-cube="heldout-observed">${check.observed.join('')}</strong> · candidate bits <strong data-cube="heldout-predicted">${check.predicted.join('')}</strong></p>${verdict(check.allMatch ? 'good' : 'failure', check.allMatch ? 'HELD-OUT OUTPUTS MATCH' : 'HELD-OUT OUTPUTS REJECT CANDIDATE', check.allMatch ? 'All four fresh public rows agree with independently evaluated candidate outputs.' : 'At least one fresh public row disagrees; recovery is not accepted.')}`
    }
    const work = onlineWork(online, heldout ?? undefined)
    node('cube-online-view').innerHTML = `<div class="table-wrap" tabindex="0"><table><caption>Online cube queries and candidate filtering</caption><thead><tr><th scope="col">cube</th><th scope="col">public vertices</th><th scope="col">outputs</th><th scope="col">sum</th><th scope="col">equation</th><th scope="col">candidates after row</th></tr></thead><tbody>${table}</tbody></table></div>
      <p class="mono">Candidate filtering <strong data-cube="candidate-counts">8 → ${online.observations.map(observation => observation.candidatesAfter.length).join(' → ')}</strong> · cube sums <strong data-cube="online-sums">${online.observations.map(observation => observation.recordedSum).join('')}</strong> · matrix rank <strong data-cube="rank">${online.rank}</strong>/3 · frozen provisional candidate <strong data-cube="candidate">${safe(provisional)}</strong></p>
      <p class="mono">Before held-outs: ${preWork.rawEvaluations} raw cube-vertex evaluations across ${preWork.distinctPublicRows} distinct public rows.</p>
      ${unique ? verdict('neutral', 'ONE PROVISIONAL TOY KEY', 'Three independent affine equations leave one candidate; it is not confirmed until fresh outputs and controller ground truth agree.') : verdict('neutral', 'AMBIGUOUS — STOP', `${online.candidates.length} candidates remain.`)}
      ${heldoutBlock}
      ${heldout ? `<p class="mono">Complete online work: <strong data-cube="online-raw">${work.rawEvaluations}</strong> raw evaluations = 12 cube vertices + 4 held-outs; <strong data-cube="online-distinct">${work.distinctPublicRows}</strong> distinct public rows.</p>` : ''}
      ${compared !== null ? verdict(compared ? 'alarm' : 'failure', compared ? 'TOY SECRET CONFIRMED' : 'TOY SECRET DID NOT MATCH', compared ? `The controller independently compared candidate ${provisional} with its hidden three-bit teaching secret.` : 'The candidate and controller secret differ.') : ''}`
  }

  function renderFailure(): void {
    if (!failure) {
      node('cube-failure-view').innerHTML = `<p class="muted">${preprocessing ? 'Choose a deterministic failure case.' : 'Run preprocessing to enable the failure cases.'}</p>`
      return
    }
    if (failure.kind === 'drop') {
      node('cube-failure-view').innerHTML = `<p class="mono">Used C12 and C13 only · sums ${failure.online.observations.map(observation => observation.recordedSum).join('')} · rank <strong data-cube="drop-rank">${failure.online.rank}</strong>/3 · candidates <strong data-cube="drop-candidates">${candidateLabels(failure.online.candidates)}</strong></p>${verdict('neutral', 'AMBIGUOUS — STOP', 'Dropping C24 leaves two keys, 001 and 110. No candidate is selected or compared with the controller secret.')}`
      return
    }
    const candidate = failure.online.candidates[0]
    const check = failure.heldout!
    const mismatches = check.rows.flatMap((row, index) => check.matches[index] ? [] : [publicLabel(row)])
    const work = onlineWork(failure.online, check)
    node('cube-failure-view').innerHTML = `<p class="mono">Actual cube sums <strong data-cube="flip-actual-sums">${failure.online.observations.map(observation => observation.actualSum).join('')}</strong> · recorded sums <strong data-cube="flip-sums">${failure.online.observations.map(observation => observation.recordedSum).join('')}</strong> after flipping C13 · rank ${failure.online.rank}/3 · wrong candidate <strong data-cube="flip-candidate">${keyLabel(candidate)}</strong></p><p>Held-out observations ${check.observed.join('')} versus candidate predictions <strong data-cube="flip-predicted">${check.predicted.join('')}</strong>; mismatching public rows: ${mismatches.join(', ')}.</p><p class="mono">Work remains ${work.rawEvaluations} raw evaluations across ${work.distinctPublicRows} distinct public rows.</p>${verdict('failure', `HELD-OUT CHECK REJECTED ${keyLabel(candidate)}`, 'A full-rank system can still encode a bad observation. Fresh black-box outputs prevent a false recovery verdict.')}`
  }

  function updateButtons(): void {
    node<HTMLButtonElement>('cube-online').disabled = !preprocessing
    node<HTMLButtonElement>('cube-drop').disabled = !preprocessing
    node<HTMLButtonElement>('cube-flip').disabled = !preprocessing
    node<HTMLButtonElement>('cube-heldout').disabled = !frozenCandidate || !!heldout
    node<HTMLButtonElement>('cube-compare').disabled = !frozenCandidate || !heldout?.allMatch || compared !== null
  }

  function render(): void { renderPreprocessing(); renderOnline(); renderFailure(); updateButtons() }

  panel.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button')
    if (!button) return
    if (button.id === 'cube-preprocess') {
      preprocessing = runPreprocessing(); online = null; heldout = null; frozenCandidate = null; compared = null; failure = null
    } else if (button.id === 'cube-online' && preprocessing) {
      online = runOnline(controllerOracle, preprocessing, AFFINE_CUBES)
      frozenCandidate = online.candidates.length === 1 ? [...online.candidates[0]] as ToyKey : null
      heldout = null; compared = null
    } else if (button.id === 'cube-heldout' && frozenCandidate) {
      heldout = verifyHeldouts(controllerOracle, frozenCandidate); compared = null
    } else if (button.id === 'cube-compare' && frozenCandidate && heldout?.allMatch) {
      compared = keyLabel(frozenCandidate) === keyLabel(TEACHING_SECRET)
    } else if (button.id === 'cube-drop' && preprocessing) {
      failure = { kind: 'drop', online: runOnline(controllerOracle, preprocessing, ['C12', 'C13']) }
    } else if (button.id === 'cube-flip' && preprocessing) {
      const bad = runOnline(controllerOracle, preprocessing, AFFINE_CUBES, 'C13')
      failure = { kind: 'flip', online: bad, heldout: verifyHeldouts(controllerOracle, bad.candidates[0]) }
    }
    render()
  })

  render()
}
