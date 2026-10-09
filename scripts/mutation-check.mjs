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
function owningTest(grep) { return run('npx', ['playwright', 'test', 'e2e/claims.spec.ts', '-g', grep]) }

const records = []
for (const entry of cases) {
  const source = await readFile(entry.file, 'utf8')
  if (source.split(entry.anchor).length !== 2) throw new Error(`${entry.name}: anchor must occur exactly once`)
  const baselineBuild = run('npm', ['run', 'build'])
  if (baselineBuild.status !== 0) throw new Error(`${entry.name}: baseline does not build\n${baselineBuild.output}`)
  const baselineHash = await bundleHash()
  const baselineTest = owningTest(entry.test)
  if (baselineTest.status !== 0 || !baselineTest.output.includes('1 passed')) throw new Error(`${entry.name}: owning baseline test did not pass\n${baselineTest.output}`)
  let mutantBuild = { status: null, output: '' }
  let mutantTest = { status: null, output: '' }
  let mutantHash = ''
  let restoredHash = ''
  try {
    await writeFile(entry.file, source.replace(entry.anchor, entry.replacement))
    if ((await readFile(entry.file, 'utf8')) === source) throw new Error(`${entry.name}: patch did not change source`)
    mutantBuild = run('npm', ['run', 'build'])
    if (mutantBuild.status === 0) {
      mutantHash = await bundleHash()
      if (mutantHash !== baselineHash) mutantTest = owningTest(entry.test)
    }
  } finally {
    await writeFile(entry.file, source)
    const restoration = run('npm', ['run', 'build'])
    if (restoration.status !== 0) throw new Error(`${entry.name}: source restoration did not build\n${restoration.output}`)
    restoredHash = await bundleHash()
  }
  const killed = mutantBuild.status === 0 && mutantHash !== baselineHash && mutantTest.status !== 0 && mutantTest.output.includes('Error: expect(') && !mutantTest.output.includes('Process from config.webServer') && restoredHash === baselineHash
  records.push({ name: entry.name, file: entry.file, anchor: entry.anchor, replacement: entry.replacement, owningTest: entry.test, baselinePassed: true, patchedSourceBuilt: mutantBuild.status === 0, servedBundleChanged: mutantHash !== baselineHash, assertionFailed: mutantTest.output.includes('Error: expect('), restoredBundle: restoredHash === baselineHash, killed })
  process.stdout.write(`${killed ? 'KILLED' : 'SURVIVED'} ${entry.name}\n`)
  if (!killed) process.stderr.write(`${mutantBuild.output}\n${mutantTest.output}\n`)
}
await mkdir('docs', { recursive: true })
await writeFile('docs/mutation-results.json', `${JSON.stringify({ runDate: new Date().toISOString(), cases: records }, null, 2)}\n`)
if (records.some(record => !record.killed)) process.exitCode = 1
