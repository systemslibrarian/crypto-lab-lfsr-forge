/** Transcribed eSTREAM/ECRYPT TRIVIUM 80-bit key / 80-bit IV run log.
 * Original directory: http://www.ecrypt.eu.org/stream/svn/viewcvs.cgi/ecrypt/trunk/submissions/trivium/
 * Original host could not be fetched; no claim of a verified.test-vectors file.
 * Pinned archival revision: cantora/avr-crypto-lib commit
 * 2a5b018aa71694c5021f41e469234c3c5adb8784 (2011-01-22).
 * https://raw.githubusercontent.com/cantora/avr-crypto-lib/2a5b018aa71694c5021f41e469234c3c5adb8784/testvectors/trivium-unverified.test-vectors
 * Full fetched file: 345679 bytes; SHA-256
 * c7441a6f59f284b9875c96925137b617ca6ab5c67d5b11a0be085340dca885df.
 * Its entire 80/80 section (starts at byte 227299) equals trivium-80.80.test-vectors
 * at that revision: 118380 bytes; SHA-256
 * a65b0ca8c3f8bdfdf1df8db2e7a53210f16f6c39b8ef0e558a265b0aa7c0c495.
 * Independently fetched bmkessler/trivium's archived 80/80 file is byte-identical.
 * Three vectors across THREE sets; every 64-byte slice plus the 64-byte XOR
 * digest over all eight chunks of the 512-byte stream is pinned. This is not
 * a 512-byte digest. Only transcribed values are committed, not the source log.
 */
import { hex, keystreamBits, packBytes, parse80 } from './trivium'
export const VECTORS = [
  {
    "set": 1,
    "number": 0,
    "key": "80000000000000000000",
    "iv": "00000000000000000000",
    "slices": [
      {
        "offset": 0,
        "hex": "38eb86ff730d7a9caf8df13a4420540dbb7b651464c87501552041c249f29a64d2fbf515610921ebe06c8f92cecf7f8098ff20cccc6a62b97be8ef7454fc80f9"
      },
      {
        "offset": 192,
        "hex": "eaf2625d411f61e41f6baeeddd5fe202600bd472f6c9cd1e9134a745d900ef6c023e4486538f09930cfd37157c0eb57c3ef6c954c42e707d52b743ad83cff297"
      },
      {
        "offset": 256,
        "hex": "9a203cf7b2f3f09c43d188aa13a5a2021ee998c42f777e9b67c3fa221a0aa1b041aa9e86bc2f5c52aff11f7d9ee480cb1187b20eb46d582743a52d7cd080a24a"
      },
      {
        "offset": 448,
        "hex": "ebf14772061c210843c18cea2d2a275ae02fcb18e5d7942455ff77524e8a4ca51e369a847d1aeefb9002fcd02342983ceafa9d487cc2032b10192cd416310fa4"
      }
    ],
    "xorDigest": "7ae3a4b53355061766122e04391ea1e6699b51c21a1f8058d3cf74a209d7e4cb571ed771525ca492552565c10a05e81b945de28aac043deb349fd438784904d2"
  },
  {
    "set": 3,
    "number": 0,
    "key": "00010203040506070809",
    "iv": "00000000000000000000",
    "slices": [
      {
        "offset": 0,
        "hex": "d2a8740bba6fd9067077f9afc0c27d4032b6aeae50c42eceff255c584c0143e78cfa4e3ebe03074f23d762d0a7563521be755b2166cd920eecbb5db84737fa01"
      },
      {
        "offset": 192,
        "hex": "3f6a4cdda613ce64b1f9c9ac662e4ab2ef2751400cd6a0a119cf0be7b287e727536d18d953327b2d971ef9f34ea28762cd062b7aea83c1ac4363333219f767f8"
      },
      {
        "offset": 256,
        "hex": "44d06cb5157b2a8ee1ceebc6dd5b500de7fbf83f189dfbe822042f85d814427ff03f108fdb0989e7693257c8639477128bf371caa422d3306f6cdc1e03645bfe"
      },
      {
        "offset": 448,
        "hex": "30cd0b54e741f4cdd6e9b5ccab184d7a3453c03d4158fe7cb8bc92ecb66811c6e560c62cf1ade69bae308adc0602667ccadee71244968844376fbeb113e73345"
      }
    ],
    "xorDigest": "44dfe4d6f43708ec245c7eaca3b1b20fbfa9436c7b2dc676457c932cc11f3960e5d9852d2f9fdc77aea2ddec91cc2e1bde326cf4e21ed9380983c897cdc005a6"
  },
  {
    "set": 5,
    "number": 0,
    "key": "00000000000000000000",
    "iv": "80000000000000000000",
    "slices": [
      {
        "offset": 0,
        "hex": "f8901736640549e3ba7d42ea2d07b9f49233c18d773008bd755585b1a8cbab86c1e9a9b91f1ad33483fd6ee3696d659c9374260456a36aae11f033a519cbd5d7"
      },
      {
        "offset": 192,
        "hex": "87423582af64475c3a9c092e32a53c5fe07d35b4c9ca288a89a43def3913ea9237ca43342f3f8e83ad3a5c38d463516f94e3724455656a36279e3e924d442f06"
      },
      {
        "offset": 256,
        "hex": "d94389a90e6f3bf2bb4c8b057339aad8aa2fea238c29fcac0d1ff1cb2535a07058ba995dd44cfc54ccec54a5405b944c532d74e50ea370cdf1ba1cbae93fc0b5"
      },
      {
        "offset": 448,
        "hex": "4844151714e56a3a2bbfba426a1d60f9a4f265210a91ec29259ae2035234091c49ffb1893fa102d425c57c39eb4916f6d148dc83ebf7de51eeb9abfe045fb282"
      }
    ],
    "xorDigest": "76772ebde1d3a73dbf3bb7e1a5bcc0491419ff354d32f42e4d17f999e3b19da1989d6a1051eb0bbb9f880252f71e16b315324198ab34162dfea981cf566f25ad"
  }
] as const
export function checkVectors(): { passed: number; total: number } {
  let passed = 0
  for (const vector of VECTORS) {
    const stream = packBytes(keystreamBits(parse80(vector.key), parse80(vector.iv), 4096))
    for (const slice of vector.slices) passed += Number(hex(stream.slice(slice.offset, slice.offset + 64)) === slice.hex)
    const digest = new Uint8Array(64)
    stream.forEach((byte, i) => { digest[i % 64] ^= byte })
    passed += Number(hex(digest) === vector.xorDigest)
  }
  return { passed, total: VECTORS.length * 5 }
}
