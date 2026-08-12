/**
 * paddle_split_pdf — split a PDF that exceeds the API limits (100 pages for
 * sync, 1000 pages / 50 MB for async local upload). Pure TypeScript via
 * pdf-lib, no python dependency.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-fs'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { splitPdf } from '../splitter.ts'
import { PaddleError } from '../service.ts'
import { jsonOutput } from './shared.ts'

const MAX_INPUT_BYTES = 400 * 1024 * 1024

interface SplitArgs {
  file: string
  maxPages?: number
  outputDir?: string
}

export function defineSplitTool(ctx: Context) {
  return defineTool({
    name: 'paddle_split_pdf',
    description:
      '把超过 PaddleOCR 限制的 PDF 拆成多份：按 maxPages 分页拆分（缺省 100，sync 上限；async 用 1000），'
      + '每份同时满足大小上限（50MB）。返回各分片路径，供 paddle_ocr_layout 逐个处理。',
    parameters: {
      file: {
        type: 'string',
        required: true,
        description: '要拆分的 PDF 文件路径',
      },
      maxPages: {
        type: 'integer',
        description: '每份最大页数：缺省 100（sync 模式上限）；async 模式传 1000',
      },
      outputDir: {
        type: 'string',
        description: '分片输出目录；缺省为源文件同目录下的 <文件名>_splits',
      },
    },
    output: jsonOutput(),
    timeoutMs: 300_000,
    async execute(args, exec) {
      const input = (args ?? {}) as SplitArgs
      const sessionCwd = exec.agent?.session.header.cwd
      const target = await ctx.fs.resolve(input.file, sessionCwd === undefined ? undefined : { cwd: sessionCwd })
      const info = await ctx.fs.stat(target)
      if (info === undefined) throw new PaddleError(`文件不存在：${input.file}`, 'invalid-file')
      if ((info.size ?? 0) > MAX_INPUT_BYTES) throw new PaddleError(`PDF 过大（上限 400MB）`, 'too-large')
      if (!input.file.toLowerCase().endsWith('.pdf')) throw new PaddleError('只能拆分 PDF 文件', 'invalid-file')

      const bytes = await ctx.fs.readBytes(target, exec.signal, MAX_INPUT_BYTES)
      const maxPages = input.maxPages ?? 100
      if (!Number.isInteger(maxPages) || maxPages < 1) throw new PaddleError('maxPages 必须是正整数', 'invalid-file')
      const parts = await splitPdf(bytes, maxPages, 50 * 1024 * 1024)

      const baseName = input.file.replace(/\.pdf$/i, '')
      const outDir = ctx.fs.processPath(await ctx.fs.resolve(
        input.outputDir ?? `${baseName}_splits`,
        sessionCwd === undefined ? undefined : { cwd: sessionCwd },
      ))
      mkdirSync(outDir, { recursive: true })

      const paths: Array<{ part: number; path: string; startPage: number; endPage: number }> = []
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        const name = `part_${i + 1}_p${part.startPage}-${part.endPage}.pdf`
        const abs = join(outDir, name)
        const { writeFileSync } = await import('node:fs')
        writeFileSync(abs, part.bytes)
        paths.push({ part: i + 1, path: abs, startPage: part.startPage, endPage: part.endPage })
      }
      return {
        ok: true,
        parts: paths.length,
        outputDir: outDir,
        files: paths,
        summary: `已拆分为 ${paths.length} 份：\n` + paths.map(p => `- ${p.path}（第 ${p.startPage}-${p.endPage} 页）`).join('\n'),
      }
    },
  })
}
