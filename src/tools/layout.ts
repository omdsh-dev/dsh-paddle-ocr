/**
 * paddle_ocr_layout — full document layout parsing: split when over API
 * limits, extract per-page markdown + images, write into the workspace, and
 * return a summary. Async by default; the queue-full code retries with
 * exponential backoff and finally reports a friendly "queued" message.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-fs'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { OcrFileType, OcrOptions } from '../api.ts'
import type { PaddleOcrService } from '../service.ts'
import { PaddleError } from '../service.ts'
import { writeResultsToWorkspace } from '../workspace-output.ts'
import type { PaddleOcrConfig } from '../config.ts'
import { jsonOutput } from './shared.ts'

const DEFAULT_OUTPUT_DIR = 'paddle-ocr-output'
const MAX_INPUT_BYTES = 200 * 1024 * 1024

interface LayoutArgs {
  file: string
  mode?: 'sync' | 'async'
  fileType?: OcrFileType
  orientation?: boolean
  unwarping?: boolean
  chart?: boolean
  visualize?: boolean
  outputDir?: string
}

export function defineLayoutTool(ctx: Context, service: PaddleOcrService, getConfig: () => PaddleOcrConfig) {
  return defineTool({
    name: 'paddle_ocr_layout',
    description:
      'PaddleOCR 文档布局解析：把 PDF/图片逐页解析为 Markdown（含图表识别、方向矫正、展平），结果 md+图片落盘到工作区并返回摘要。'
      + '默认走异步接口（1000 页内），同步模式限 100 页；超限自动拆分。队列满（10010）会自动指数退避重试，最多 5 次。',
    parameters: {
      file: {
        type: 'string',
        required: true,
        description: '本地文件路径（PDF 或图片 png/jpg/jpeg/bmp/tiff/webp）',
      },
      mode: {
        type: 'string',
        enum: ['sync', 'async'],
        description: '处理模式：async 任务式（缺省，最多 1000 页/50MB）；sync 同步返回（最多 100 页，大文件慢）',
      },
      fileType: {
        type: 'integer',
        enum: [0, 1],
        description: '文件类型：0=PDF，1=图片；缺省按扩展名自动识别',
      },
      orientation: {
        type: 'boolean',
        description: '启用文档方向分类矫正（0/90/180/270 度）；缺省用 设置 → 插件 → PaddleOCR 里的默认值',
      },
      unwarping: {
        type: 'boolean',
        description: '启用文档展平矫正（褶皱/弯曲页面）；缺省用设置里的默认值',
      },
      chart: {
        type: 'boolean',
        description: '启用图表识别（解析为表格）；缺省用设置里的默认值',
      },
      visualize: {
        type: 'boolean',
        description: '同时保存可视化标注图；缺省用设置里的默认值',
      },
      outputDir: {
        type: 'string',
        description: `结果输出目录，缺省 ${DEFAULT_OUTPUT_DIR}（相对会话工作区）`,
      },
    },
    output: jsonOutput(),
    timeoutMs: 3_600_000,
    async execute(args, exec) {
      const input = (args ?? {}) as LayoutArgs
      const config = getConfig().defaults
      const mode = input.mode ?? config.mode
      const opts: OcrOptions = {
        orientation: input.orientation ?? config.orientation,
        unwarping: input.unwarping ?? config.unwarping,
        chart: input.chart ?? config.chart,
        visualize: input.visualize ?? config.visualize,
      }
      const sessionCwd = exec.agent?.session.header.cwd
      const target = await ctx.fs.resolve(input.file, sessionCwd === undefined ? undefined : { cwd: sessionCwd })
      const info = await ctx.fs.stat(target)
      if (info === undefined) throw new PaddleError(`文件不存在：${input.file}`, 'invalid-file')
      if (info.type !== 'file') throw new PaddleError(`不是普通文件：${input.file}`, 'invalid-file')
      const size = info.size ?? 0
      if (size > MAX_INPUT_BYTES) {
        throw new PaddleError(`文件过大（${(size / 1024 / 1024).toFixed(1)}MB，上限 200MB），请先用 paddle_split_pdf 拆分`, 'too-large')
      }
      const bytes = await ctx.fs.readBytes(target, exec.signal, MAX_INPUT_BYTES)
      const name = input.file.split(/[/\\]/).pop() ?? 'document.pdf'
      const result = await service.processFile(name, bytes, mode, opts, exec.signal, progress => {
        void progress
      })
      const output = await writeResultsToWorkspace(ctx, result.pages, input.outputDir ?? DEFAULT_OUTPUT_DIR, sessionCwd)
      const mdFileNames = output.mdFiles
        .map(path => path.split(/[/\\]/).pop())
        .filter((name): name is string => name !== undefined)
      return {
        ok: true,
        mode: result.mode,
        pages: result.pages.length,
        parts: result.parts,
        outputDir: output.outputDir,
        mdFiles: mdFileNames,
        imageFiles: output.imageFiles.length,
        summary: `已解析 ${result.pages.length} 页（${result.mode === 'async' ? '异步' : '同步'}，拆分为 ${result.parts} 份提交），`
          + `md+图片已写入 ${output.outputDir}`,
      }
    },
  })
}
