import type { Bit } from '../lfsr/lfsr'

export type A51Register = 'r1' | 'r2' | 'r3'
export type A51State = Readonly<Record<A51Register, number>>
export type A51ClockMode = 'majority' | 'regular'

export type A51Step = Readonly<{
  before: A51State
  clockBits: readonly [Bit, Bit, Bit]
  majority: Bit
  advanced: readonly [boolean, boolean, boolean]
  output: Bit
  next: A51State
}>

export const A51_REGISTERS = {
  r1: { length: 19, mask: 0x07ffff, taps: [13, 16, 17, 18], tapMask: 0x072000, clockBit: 8, outputBit: 18 },
  r2: { length: 22, mask: 0x3fffff, taps: [20, 21], tapMask: 0x300000, clockBit: 10, outputBit: 21 },
  r3: { length: 23, mask: 0x7fffff, taps: [7, 20, 21, 22], tapMask: 0x700080, clockBit: 10, outputBit: 22 },
} as const

export const A51_REGISTER_ORDER: readonly A51Register[] = ['r1', 'r2', 'r3']
export const A51_WARMUP_CLOCKS = 100

/**
 * Historical reverse-engineered reference implementation and vector.
 *
 * Marc Briceno, Ian Goldberg, and David Wagner, 1998–1999. The archived
 * source is pinned rather than treating this unofficial definition as a
 * current cellular recommendation or a newly published standard.
 */
export const BGW_SOURCE = {
  commit: '02f25aeade71a9addc06e8f9678742e04d25fd59',
  sha256: '72488fd7e9512e40a246c2b137ef49b4fc60b35a69218bc6bc47f88da3ab1eb1',
  url: 'https://github.com/NSAPlayset/TWILIGHTVEGETABLE/blob/02f25aeade71a9addc06e8f9678742e04d25fd59/A5.1/C/A5.1.c',
} as const

export const BGW_VECTOR = {
  keyHex: '1223456789abcdef',
  count: 0x134,
  afterKey: { r1: 0x4030d, r2: 0x1fa05c, r3: 0x3668e1 },
  afterCount: { r1: 0x064a2, r2: 0x2bc0e5, r3: 0x72df8d },
  keystreamStart: { r1: 0x1da4b, r2: 0x2cb2f9, r3: 0x08be5f },
  aToBHex: '534eaa582fe8151ab6e1855a728c00',
  bToAHex: '24fd35a35d5fb6526d32f906df1ac0',
} as const satisfies Readonly<{
  keyHex: string
  count: number
  afterKey: A51State
  afterCount: A51State
  keystreamStart: A51State
  aToBHex: string
  bToAHex: string
}>

export type A51Setup = Readonly<{
  afterKey: A51State
  afterCount: A51State
  keystreamStart: A51State
}>

const parity = (value: number): Bit => {
  let folded = value >>> 0
  folded ^= folded >>> 16
  folded ^= folded >>> 8
  folded ^= folded >>> 4
  folded ^= folded >>> 2
  folded ^= folded >>> 1
  return (folded & 1) as Bit
}
function assertState(state: A51State): void {
  for (const register of A51_REGISTER_ORDER) {
    const value = state[register]
    if (!Number.isInteger(value) || value < 0 || value > A51_REGISTERS[register].mask) {
      throw new Error(`${register.toUpperCase()} must be an unsigned ${A51_REGISTERS[register].length}-bit value.`)
    }
  }
}
export function parseA51Key(text: string): Uint8Array {
  if (!/^[0-9a-fA-F]{16}$/.test(text)) throw new Error(`A5/1 key must contain exactly 16 hex digits (64 bits); received ${text.length} characters.`)
  return Uint8Array.from(text.match(/../g)!, byte => Number.parseInt(byte, 16))
}

export function stateHex(state: A51State): string {
  assertState(state)
  return `${state.r1.toString(16).padStart(5, '0')} / ${state.r2.toString(16).padStart(6, '0')} / ${state.r3.toString(16).padStart(6, '0')}`
}

export function stateBits(state: A51State, register: A51Register): Bit[] {
  assertState(state)
  return Array.from({ length: A51_REGISTERS[register].length }, (_, position) => ((state[register] >>> position) & 1) as Bit)
}

export function majority(a: Bit, b: Bit, c: Bit): Bit {
  return (a + b + c >= 2 ? 1 : 0) as Bit
}

export function clockOne(value: number, register: A51Register): number {
  const profile = A51_REGISTERS[register]
  if (!Number.isInteger(value) || value < 0 || value > profile.mask) throw new Error(`${register.toUpperCase()} is outside its ${profile.length}-bit range.`)
  return ((value << 1) & profile.mask) | parity(value & profile.tapMask)
}

export function clockAll(state: A51State): A51State {
  assertState(state)
  return {
    r1: clockOne(state.r1, 'r1'),
    r2: clockOne(state.r2, 'r2'),
    r3: clockOne(state.r3, 'r3'),
  }
}

export function clockDecision(state: A51State): Readonly<{
  clockBits: readonly [Bit, Bit, Bit]
  majority: Bit
  advanced: readonly [boolean, boolean, boolean]
}> {
  assertState(state)
  const clockBits = A51_REGISTER_ORDER.map(register => ((state[register] >>> A51_REGISTERS[register].clockBit) & 1) as Bit) as [Bit, Bit, Bit]
  const vote = majority(...clockBits)
  return { clockBits, majority: vote, advanced: clockBits.map(bit => bit === vote) as [boolean, boolean, boolean] }
}

/** Historical output order: decide and clock first, then XOR the three MSBs. */
export function clockA51(state: A51State, mode: A51ClockMode = 'majority'): A51Step {
  assertState(state)
  if (mode !== 'majority' && mode !== 'regular') throw new Error('Clock mode must be majority or regular.')
  const decision = clockDecision(state)
  const advanced = (mode === 'regular' ? [true, true, true] : decision.advanced) as [boolean, boolean, boolean]
  const next = Object.fromEntries(A51_REGISTER_ORDER.map((register, index) => [register, advanced[index] ? clockOne(state[register], register) : state[register]])) as Record<A51Register, number>
  const output = A51_REGISTER_ORDER.reduce<number>((sum, register) => sum ^ ((next[register] >>> A51_REGISTERS[register].outputBit) & 1), 0) as Bit
  return { before: { ...state }, clockBits: decision.clockBits, majority: decision.majority, advanced, output, next }
}

function xorInput(state: A51State, input: Bit): A51State {
  return { r1: state.r1 ^ input, r2: state.r2 ^ input, r3: state.r3 ^ input }
}

export function setupA51(key: Uint8Array, count: number): A51Setup {
  if (key.length !== 8) throw new Error('A5/1 key must contain exactly 8 bytes (64 bits).')
  if (!Number.isInteger(count) || count < 0 || count >= 2 ** 22) throw new Error('COUNT must be an integer from 0 through 2^22 − 1.')
  let state: A51State = { r1: 0, r2: 0, r3: 0 }
  // BGW convention: first key byte first, each byte LSB first; clock, then XOR bit 0.
  for (let index = 0; index < 64; index++) {
    state = clockAll(state)
    state = xorInput(state, ((key[index >>> 3] >>> (index & 7)) & 1) as Bit)
  }
  const afterKey = { ...state }
  for (let index = 0; index < 22; index++) {
    state = clockAll(state)
    state = xorInput(state, ((count >>> index) & 1) as Bit)
  }
  const afterCount = { ...state }
  for (let index = 0; index < A51_WARMUP_CLOCKS; index++) state = clockA51(state).next
  return { afterKey, afterCount, keystreamStart: { ...state } }
}

export function generateA51(state: A51State, count: number, mode: A51ClockMode = 'majority'): Readonly<{ bits: Bit[]; state: A51State }> {
  assertState(state)
  if (!Number.isInteger(count) || count < 0 || count > 4096) throw new Error('Output count must be an integer from 0 through 4,096.')
  const bits: Bit[] = []
  let current = { ...state }
  for (let index = 0; index < count; index++) {
    const step = clockA51(current, mode)
    bits.push(step.output)
    current = step.next
  }
  return { bits, state: current }
}

export function packMsbFirst(bits: readonly number[]): Uint8Array {
  if (bits.some(bit => bit !== 0 && bit !== 1)) throw new Error('Keystream bits must be binary.')
  const bytes = new Uint8Array(Math.ceil(bits.length / 8))
  bits.forEach((bit, index) => { bytes[index >>> 3] |= bit << (7 - (index & 7)) })
  return bytes
}

export function bytesHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export function runBgwVector(): Readonly<A51Setup & { aToB: Bit[]; bToA: Bit[]; aToBHex: string; bToAHex: string }> {
  const setup = setupA51(parseA51Key(BGW_VECTOR.keyHex), BGW_VECTOR.count)
  // The two 114-bit blocks are consecutive; there is no second 100-clock gap.
  const stream = generateA51(setup.keystreamStart, 228).bits
  const aToB = stream.slice(0, 114), bToA = stream.slice(114)
  return { ...setup, aToB, bToA, aToBHex: bytesHex(packMsbFirst(aToB)), bToAHex: bytesHex(packMsbFirst(bToA)) }
}
