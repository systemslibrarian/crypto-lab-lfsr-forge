/** De Cannière–Preneel, Trivium Specifications §§2.1–2.2.
 * State positions in the paper are ONE-based; this array is zero-based.
 * This inspectable teaching implementation is not a production crypto API. */
export const INIT_ROUNDS = 1152
export const AND_TAPS = [[91, 92], [175, 176], [286, 287]] as const
export type TriviumState = Uint8Array
export function parse80(text: string, name = 'Key'): Uint8Array {
  if (!/^[0-9a-fA-F]{20}$/.test(text)) throw new Error(`${name} must contain exactly 20 hex digits (80 bits); received ${text.length} characters.`)
  return Uint8Array.from(text.match(/../g)!, x => Number.parseInt(x, 16))
}
export function hex(bytes: Uint8Array): string { return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('') }
export function keyBits(bytes: Uint8Array): Uint8Array {
  if (bytes.length !== 10) throw new Error('Key and IV must each have exactly 10 bytes (80 bits).')
  // eSTREAM serialization, confirmed by all pinned slices: K1 is MSB of last byte.
  return Uint8Array.from({ length: 80 }, (_, i) => (bytes[9 - (i >> 3)] >> (7 - i % 8)) & 1)
}
export function keyBytes(bits: Uint8Array): Uint8Array {
  if (bits.length !== 80 || bits.some(x => x > 1)) throw new Error('Expected 80 key bits.')
  const bytes = new Uint8Array(10)
  bits.forEach((b, i) => { bytes[9 - (i >> 3)] |= b << (7 - i % 8) })
  return bytes
}
export function loadState(key: Uint8Array, iv: Uint8Array): TriviumState {
  const state = new Uint8Array(288)
  state.set(keyBits(key)); state.set(keyBits(iv), 93); state.fill(1, 285)
  return state
}
/** Mutates one private state, returns the output BEFORE feedback. Hot worker path. */
export function advance(state: TriviumState): number {
  const t1 = state[65] ^ state[92], t2 = state[161] ^ state[176], t3 = state[242] ^ state[287]
  const z = t1 ^ t2 ^ t3
  const a = t1 ^ (state[AND_TAPS[0][0] - 1] & state[AND_TAPS[0][1] - 1]) ^ state[170]
  const b = t2 ^ (state[AND_TAPS[1][0] - 1] & state[AND_TAPS[1][1] - 1]) ^ state[263]
  const c = t3 ^ (state[AND_TAPS[2][0] - 1] & state[AND_TAPS[2][1] - 1]) ^ state[68]
  state.copyWithin(1, 0, 92); state.copyWithin(94, 93, 176); state.copyWithin(178, 177, 287)
  state[0] = c; state[93] = a; state[177] = b
  return z
}
export function clock(state: TriviumState): { z: number; t1: number; t2: number; t3: number; feedback: number[]; next: TriviumState } {
  if (state.length !== 288 || state.some(x => x > 1)) throw new Error('State must contain 288 binary symbols.')
  const t1 = state[65] ^ state[92], t2 = state[161] ^ state[176], t3 = state[242] ^ state[287]
  const next = new Uint8Array(state), z = advance(next)
  return { z, t1, t2, t3, feedback: [next[93], next[177], next[0]], next }
}
export function keystreamBits(key: Uint8Array, iv: Uint8Array, n: number, initRounds = INIT_ROUNDS): Uint8Array {
  if (!Number.isInteger(n) || n < 0 || n > 65536) throw new Error('Bit count must be an integer from 0 to 65,536.')
  if (!Number.isInteger(initRounds) || initRounds < 0 || initRounds > INIT_ROUNDS) throw new Error('Initialization rounds must be an integer from 0 to 1,152.')
  const state = loadState(key, iv)
  for (let i = 0; i < initRounds; i++) advance(state)
  // [extension] A Grain-128AEAD comparison belongs beside this generator, not inside its state update.
  return Uint8Array.from({ length: n }, () => advance(state))
}
export function packBytes(bits: Uint8Array): Uint8Array {
  if (bits.length % 8 || bits.some(x => x > 1)) throw new Error('Byte packing needs a multiple of eight binary bits.')
  const bytes = new Uint8Array(bits.length / 8)
  bits.forEach((bit, i) => { bytes[i >> 3] |= bit << (i % 8) })
  return bytes
}
