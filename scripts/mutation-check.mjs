import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

// Concrete source patches. Each is applied once, built, tested, and restored.
const cases = [
  {
    name: 'BM length update', file: 'src/lfsr/bm.ts',
    anchor: 'length = index + 1 - length', replacement: 'length = index - length',
    test: 'user-entered sequence has analysis',
  },
  {
    name: 'Geffe selector truth table', file: 'src/geffe/geffe.ts',
    anchor: 'return ((x1 & x2) ^ ((1 ^ x2) & x3)) as Bit', replacement: 'return ((x1 ^ x2) ^ x3) as Bit',
    test: 'negative-claim fixture passes construction',
  },
  {
    name: 'conditional R2 equation', file: 'src/geffe/correlation.ts',
    anchor: 'required.push((observed[index] ^ x3[index]) as Bit)', replacement: 'required.push(observed[index])',
    test: 'negative-claim fixture passes construction',
  },
  {
    name: 'measured comparison count', file: 'src/geffe/correlation.ts',
    anchor: "metrics.bitComparisons += observed.length\n      if (phase === 'R1')",
    replacement: "metrics.bitComparisons += 1\n      if (phase === 'R1')",
    test: 'negative-claim fixture passes construction',
  },
  {
    name: 'negative claim wording', file: 'src/main.ts',
    anchor: "This Geffe generator's nonlinearity and high linear complexity do not prevent recovery of its secret state.",
    replacement: 'This generator resisted state recovery.',
    test: 'negative-claim fixture passes construction',
  },
  {
    name: 'frozen prediction revision', file: 'src/main.ts',
    anchor: 'run.matched = frozen.every((bit, index) => bit === run.actual![index])',
    replacement: 'run.result.prediction = [...run.actual!].reverse()\n        run.matched = frozen.every((bit, index) => bit === run.actual![index])',
    test: 'negative-claim fixture passes construction',
  },
  {
    name: 'Trivium AND replaced by XOR', file: 'src/trivium/trivium.ts',
    anchor: '(state[AND_TAPS[0][0] - 1] & state[AND_TAPS[0][1] - 1])',
    replacement: '(state[AND_TAPS[0][0] - 1] ^ state[AND_TAPS[0][1] - 1])',
    test: 'Trivium KAT and stepper',
  },
  {
    name: 'Trivium wrong warm-up count', file: 'src/trivium/trivium.ts',
    anchor: 'export const INIT_ROUNDS = 1152', replacement: 'export const INIT_ROUNDS = 1151',
    test: 'Trivium KAT and stepper',
  },
  {
    name: 'Trivium hidden key crosses worker boundary', file: 'src/trivium/panel.ts',
    anchor: "worker.postMessage({ kind: 'run', runId, iv: new Uint8Array(publicIv), observed: new Uint8Array(observed) })",
    replacement: "worker.postMessage({ kind: 'run', runId, iv: new Uint8Array(publicIv), observed: new Uint8Array(observed), hiddenKey: new Uint8Array(hiddenKey!) })",
    test: 'Trivium public-only worker',
  },
  {
    name: 'Trivium forecast always verified', file: 'src/trivium/panel.ts',
    anchor: "? 'FORECAST VERIFIED' : 'HELD — FORECAST FAILED'", replacement: "? 'FORECAST VERIFIED' : 'FORECAST VERIFIED'",
    test: 'Trivium BM profiles and frozen forecasts',
  },
  {
    name: 'Trivium negative claim missing', file: 'src/trivium/panel.ts',
    anchor: "export const TRIVIUM_NEGATIVE = 'A keystream that defeats Berlekamp–Massey is not thereby secure: with its 1,152 warm-up rounds removed, this Trivium still shows no short recurrence while its key is read off the first output bits.'",
    replacement: "export const TRIVIUM_NEGATIVE = ''", test: 'Trivium public-only worker',
  },
  {
    name: 'Boolean Walsh butterfly sign', file: 'src/boolean/analysis.ts',
    anchor: 'spectrum[block + offset + stride] = left - right',
    replacement: 'spectrum[block + offset + stride] = left + right',
    test: 'Boolean metrics, restrictions, and annihilator',
  },
  {
    name: 'Boolean restriction independence', file: 'src/boolean/analysis.ts',
    anchor: 'independent: ones * (1 << fixedVariables.length) === weight',
    replacement: 'independent: ones === weight',
    test: 'Boolean metrics, restrictions, and annihilator',
  },
  {
    name: 'Boolean annihilator search count', file: 'src/boolean/analysis.ts',
    anchor: 'candidatesTotal: 2 * candidatesPerSide',
    replacement: 'candidatesTotal: candidatesPerSide',
    test: 'Boolean metrics, restrictions, and annihilator',
  },
  {
    name: 'Boolean single-register agreement', file: 'src/boolean/attacks.ts',
    anchor: 'sum + Number(bit === observed[index])',
    replacement: 'sum + Number(bit !== observed[index])',
    test: 'Boolean public-only worker executes both correlation',
  },
  {
    name: 'Boolean pair relation', file: 'src/boolean/attacks.ts',
    anchor: 'Number((leftSequences[left - 1][index] ^ rightSequences[right - 1][index]) === bit)',
    replacement: 'Number(leftSequences[left - 1][index] === bit)',
    test: 'Boolean public-only worker executes both correlation',
  },
  {
    name: 'Boolean hidden state crosses worker boundary', file: 'src/boolean/panel.ts',
    anchor: "worker.postMessage({ kind: 'run', runId, attack: kind, observed: [...attackObserved] })",
    replacement: "worker.postMessage({ kind: 'run', runId, attack: kind, observed: [...attackObserved], hiddenState: 1 })",
    test: 'Boolean public-only worker executes both correlation',
  },
]

function run(command, args, options = {}) {
  const process = spawnSync(command, args, { encoding: 'utf8', timeout: 120000, env: { ...globalThis.process.env, CI: '1' }, ...options })
  return { status: process.status, output: `${process.stdout ?? ''}\n${process.stderr ?? ''}` }
}
async function bundleHash() {
  const files = (await readdir('dist/assets')).filter(name => name.endsWith('.js')).sort()
  const hash = createHash('sha256')
  for (const name of files) { hash.update(name); hash.update(await readFile(`dist/assets/${name}`)) }
  return hash.digest('hex')
}
async function owningTest(grep) {
  const assets = {}
  for (const file of (await readdir('dist/assets')).filter(name => name.endsWith('.js'))) assets[file] = createHash('sha256').update(await readFile(`dist/assets/${file}`)).digest('hex')
  const config = process.env.PLAYWRIGHT_CONFIG ? ['--config', process.env.PLAYWRIGHT_CONFIG] : []
  return run('npx', ['playwright', 'test', ...config, 'e2e/claims.spec.ts', '-g', grep, '--retries=0'], { env: { ...process.env, CI: '1', MUTATION_ASSETS: JSON.stringify(assets) } })
}

const records = []
for (const entry of cases) {
  const source = await readFile(entry.file, 'utf8')
  if (source.split(entry.anchor).length !== 2) throw new Error(`${entry.name}: anchor must occur exactly once`)
  const baselineBuild = run('npm', ['run', 'build'])
  if (baselineBuild.status !== 0) throw new Error(`${entry.name}: baseline does not build\n${baselineBuild.output}`)
  const baselineHash = await bundleHash()
  const baselineTest = await owningTest(entry.test)
  if (baselineTest.status !== 0 || !baselineTest.output.includes('1 passed')) throw new Error(`${entry.name}: owning baseline test did not pass\n${baselineTest.output}`)
  let mutantBuild = { status: null, output: '' }
  let mutantTest = { status: null, output: '' }
  let mutantHash = ''
  let restoredHash = ''
  let sourceDiff = ''
  let restoredGreen = false
  try {
    await writeFile(entry.file, source.replace(entry.anchor, entry.replacement))
    if ((await readFile(entry.file, 'utf8')) === source) throw new Error(`${entry.name}: patch did not change source`)
    sourceDiff = run('git', ['diff', '--', entry.file]).output.trim()
    if (!sourceDiff) throw new Error(`${entry.name}: no recorded source diff`)
    mutantBuild = run('npm', ['run', 'build'])
    if (mutantBuild.status === 0) {
      mutantHash = await bundleHash()
      if (mutantHash !== baselineHash) mutantTest = await owningTest(entry.test)
    }
  } finally {
    await writeFile(entry.file, source)
    const restoration = run('npm', ['run', 'build'])
    if (restoration.status !== 0) throw new Error(`${entry.name}: source restoration did not build\n${restoration.output}`)
    restoredHash = await bundleHash()
    const restored = await owningTest(entry.test)
    restoredGreen = restored.status === 0 && restored.output.includes('1 passed')
  }
  const assertionFailed = mutantTest.output.includes('Error: expect(') || mutantTest.output.includes('expect(received)')
  const killed = mutantBuild.status === 0 && mutantHash !== baselineHash && mutantTest.status !== 0 && assertionFailed && !mutantTest.output.includes('Process from config.webServer') && !mutantTest.output.includes('MUTATION_ASSET_MISMATCH') && restoredHash === baselineHash && restoredGreen
  records.push({ name: entry.name, file: entry.file, anchor: entry.anchor, replacement: entry.replacement, sourceDiff, owningTest: entry.test, baselinePassed: true, patchedSourceBuilt: mutantBuild.status === 0, servedBundleChanged: mutantHash !== baselineHash, baselineHash, mutantHash, restoredHash, assertionFailed, restoredBundle: restoredHash === baselineHash, restoredGreen, servedAssetGuard: true, retries: 0, killed })
  process.stdout.write(`${killed ? 'KILLED' : 'SURVIVED'} ${entry.name}\n`)
  if (!killed) process.stderr.write(`${mutantBuild.output}\n${mutantTest.output}\n`)
}
await mkdir('docs', { recursive: true })
await writeFile('docs/mutation-results.json', `${JSON.stringify({ runDate: new Date().toISOString(), cases: records }, null, 2)}\n`)
if (records.some(record => !record.killed)) process.exitCode = 1
