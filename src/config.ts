/**
 * Settings namespace `paddle-ocr`: processing defaults the tools and the
 * task panel inherit. Defaults resolve through the schemastery schema; the
 * user document layers on top.
 * @module
 */

import z from '@deepseek-ai/schemastery'

/** Resolved section of the `paddle-ocr` settings namespace. */
export interface PaddleOcrConfig {
  defaults: {
    /** Default processing mode: async (job-based, up to 1000 pages) or sync (immediate, up to 100 pages). */
    mode: 'async' | 'sync'
    /** Auto-correct document rotation. */
    orientation: boolean
    /** Correct warped/wrinkled document images. */
    unwarping: boolean
    /** Parse charts into table format. */
    chart: boolean
    /** Save visualization images alongside results. */
    visualize: boolean
  }
}

/** Schemastery schema: schema defaults below the user document layer. */
export const PaddleOcrConfigSchema = z.object({
  defaults: z.object({
    mode: z.union([z.const('async'), z.const('sync')]).default('async'),
    orientation: z.boolean().default(false),
    unwarping: z.boolean().default(false),
    chart: z.boolean().default(false),
    visualize: z.boolean().default(false),
  }),
}) as unknown as z<PaddleOcrConfig>

/** Namespace name (lowercase kebab-case, per the settings service contract). */
export const PADDLE_OCR_NAMESPACE = 'paddle-ocr'
