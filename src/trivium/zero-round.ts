import { advance, keyBytes, loadState, type TriviumState } from './trivium'

export interface Equation { positions: number[]; rhs: number }
export interface LinearSystem { equations: Equation[]; rank: number; free: number[]; candidate: (choice: number) => Uint8Array }
export interface Recovery { rank: number; freeBits: number; tested: number; candidates: Uint8Array[]; equations: Equation[]; elapsedMs: number }
const parity = (x: number): number => { x ^= x >>> 16; x ^= x >>> 8; x ^= x >>> 4; return (0x6996 >>> (x & 15)) & 1 }

/** Public IV and observed bits only. No secret/key parameter or controller import. */
export function buildSystem(iv: Uint8Array, observed: Uint8Array): LinearSystem {
  if (observed.length < 66 || observed.length > 4096 || observed.some(x => x > 1)) throw new Error('Recovery needs 66–4,096 observed binary bits.')
  const known = loadState(new Uint8Array(10), iv)
  const equations: Equation[] = [], rows: { mask: bigint; rhs: number }[] = []
  for (let t = 0; t < 66; t++) {
    const positions: number[] = []; let mask = 0n, rhs = observed[t]
    for (const p of [66 - t, 93 - t, 162 - t, 177 - t, 243 - t, 288 - t]) {
      if (p <= 80) { positions.push(p); mask ^= 1n << BigInt(p - 1) } else rhs ^= known[p - 1]
    }
    equations.push({ positions, rhs }); rows.push({ mask, rhs })
  }
  const pivots: number[] = []
  for (let col = 0; col < 80; col++) {
    const bit = 1n << BigInt(col), pivot = rows.findIndex((row, i) => i >= pivots.length && !!(row.mask & bit))
    if (pivot < 0) continue
    const index = pivots.length; [rows[index], rows[pivot]] = [rows[pivot], rows[index]]
    for (let r = 0; r < rows.length; r++) if (r !== index && (rows[r].mask & bit)) { rows[r].mask ^= rows[index].mask; rows[r].rhs ^= rows[index].rhs }
    pivots.push(col)
  }
  if (rows.some(row => !row.mask && row.rhs)) throw new Error('Inconsistent linear equations.')
  const free = Array.from({ length: 80 }, (_, i) => i).filter(i => !pivots.includes(i))
  if (free.length > 20) throw new Error('Free-variable search exceeds this teaching budget.')
  // Compile the affine solution into small integer masks; no BigInt in the candidate loop.
  const masks = new Uint32Array(80), rhs = new Uint8Array(80)
  free.forEach((col, j) => { masks[col] = 1 << j })
  pivots.forEach((col, r) => { rhs[col] = rows[r].rhs; free.forEach((f, j) => { if (rows[r].mask & (1n << BigInt(f))) masks[col] |= 1 << j }) })
  return { equations, rank: pivots.length, free, candidate(choice) {
    if (!Number.isInteger(choice) || choice < 0 || choice >= 2 ** free.length) throw new Error('Invalid free-variable assignment.')
    return keyBytes(Uint8Array.from({ length: 80 }, (_, i) => rhs[i] ^ parity(masks[i] & choice)))
  } }
}

function agrees(state: TriviumState, observed: Uint8Array): boolean {
  for (let i = 0; i < observed.length; i++) if (advance(state) !== observed[i]) return false
  return true
}

export async function recoverZeroRound(iv: Uint8Array, observed: Uint8Array, onProgress: (done: number, total: number) => void = () => {}, cancelled: () => boolean = () => false): Promise<Recovery> {
  const start = performance.now(), system = buildSystem(new Uint8Array(iv), new Uint8Array(observed)), candidates: Uint8Array[] = []
  const total = 2 ** system.free.length
  // Cube attacks require a separate public-observation model; the toy-oracle lesson now lives in SAT Break.
  for (let i = 0; i < total; i++) {
    if (i % 256 === 0) { if (cancelled()) throw new Error('Recovery cancelled.'); onProgress(i, total); await new Promise<void>(resolve => setTimeout(resolve, 0)) }
    const key = system.candidate(i)
    // Recheck the original 66 bits AND every later bit; never trust equations alone.
    if (agrees(loadState(key, iv), observed)) candidates.push(key)
  }
  if (cancelled()) throw new Error('Recovery cancelled.')
  onProgress(total, total)
  return { rank: system.rank, freeBits: system.free.length, tested: total, candidates, equations: system.equations, elapsedMs: performance.now() - start }
}
