/**
 * HTTP routes for the browser half: the plugin's UI assets (SVGs) and the
 * staged job files (preview images) under their own pathnames, so preview
 * thumbnails are plain <img> tags rather than base64 payloads over RPC.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { createReadStream, existsSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'
import { join, normalize } from 'node:path'
import { STAGE_ROOT } from './staging.ts'

const CONTENT_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.md': 'text/markdown; charset=utf-8',
}

/** Absolute assets directory beside this package (both src/ and lib/ layouts). */
function assetsRoot(): string {
  return fileURLToPath(new URL('../assets/', import.meta.url))
}

export function registerPaddleRoutes(ctx: Context): () => void {
  const disposeAssets = ctx.httpServer.register({
    kind: 'prefix',
    path: '/paddle-ocr/assets',
    handler: (req, res) => serveFileFrom(req, res, '/paddle-ocr/assets', assetsRoot()),
  })
  const disposeStage = ctx.httpServer.register({
    kind: 'prefix',
    path: '/paddle-ocr/stage',
    handler: (req, res) => serveFileFrom(req, res, '/paddle-ocr/stage', STAGE_ROOT),
  })
  return () => {
    disposeAssets()
    disposeStage()
  }
}

/** Serve one file under a route prefix with traversal protection. */
function serveFileFrom(req: IncomingMessage, res: ServerResponse, prefix: string, root: string): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end()
    return
  }
  const url = new URL(req.url ?? '/', 'http://localhost')
  const relative = url.pathname.slice(prefix.length).replace(/^[/\\]+/, '')
  const normalized = normalize(relative)
  if (normalized.length === 0 || normalized.startsWith('..') || /^[/\\]/.test(relative)) {
    res.writeHead(404).end()
    return
  }
  const absolute = join(root, normalized)
  const stats = safeStat(absolute)
  if (stats === undefined || !stats.isFile()) {
    res.writeHead(404).end()
    return
  }
  const ext = normalized.toLowerCase().slice(normalized.lastIndexOf('.'))
  const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream'
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stats.size,
    'Cache-Control': 'no-cache',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  const stream = createReadStream(absolute)
  stream.on('error', () => {
    if (!res.headersSent) res.writeHead(500)
    res.end()
  })
  stream.pipe(res)
}

function safeStat(path: string) {
  try {
    return existsSync(path) ? statSync(path) : undefined
  } catch {
    return undefined
  }
}
