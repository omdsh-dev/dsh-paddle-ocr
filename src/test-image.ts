/**
 * A tiny built-in test fixture for `paddle_ocr_test`: a valid, non-blank PNG
 * generated at runtime (white page with a few dark "text lines"), so the
 * package ships no binary art and no fixture files. The API call itself is
 * what the probe measures — auth and endpoint reachability — not the text.
 * @module
 */

import { deflateSync } from 'node:zlib'

const WIDTH = 220
const HEIGHT = 90

/** CRC table for PNG chunks. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type)
  const length = new Uint8Array(4)
  new DataView(length.buffer).setUint32(0, data.byteLength)
  const body = new Uint8Array(4 + data.byteLength)
  body.set(typeBytes, 0)
  body.set(data, 4)
  const crcBytes = new Uint8Array(4)
  new DataView(crcBytes.buffer).setUint32(0, crc32(body))
  const out = new Uint8Array(8 + data.byteLength + 4)
  out.set(length, 0)
  out.set(body, 4)
  out.set(crcBytes, 4 + body.byteLength)
  return out
}

/**
 * Build the test image: white 220×90 page with five dark horizontal bars.
 * @returns the PNG bytes.
 */
export function buildTestImagePng(): Uint8Array {
  const stride = WIDTH * 3 + 1
  const raw = new Uint8Array(stride * HEIGHT)
  for (let y = 0; y < HEIGHT; y++) {
    const rowStart = y * stride
    raw[rowStart] = 0 // filter: none
    const dark = y > 14 && y < 74 && (y - 14) % 12 < 4
    for (let x = 0; x < WIDTH; x++) {
      const px = rowStart + 1 + x * 3
      if (dark && x >= 20 && x < 200) {
        raw[px] = raw[px + 1] = raw[px + 2] = 40
      } else {
        raw[px] = raw[px + 1] = raw[px + 2] = 255
      }
    }
  }
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, WIDTH)
  view.setUint32(4, HEIGHT)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: truecolor
  const idat = deflateSync(raw)
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const parts = [signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))]
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0)
  const png = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    png.set(part, offset)
    offset += part.byteLength
  }
  return png
}
