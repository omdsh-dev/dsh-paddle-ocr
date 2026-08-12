/**
 * Panel wire types, mirrored from the host job registry.
 * @module
 */

export type JobPhase =
  | 'queued' | 'checking' | 'splitting' | 'submitting' | 'running' | 'downloading'
  | 'done' | 'failed' | 'queue-full'

export interface JobPage {
  index: number
  markdownText: string
  imagePaths: string[]
  visualizationPaths: string[]
}

export interface JobResults {
  pageCount: number
  pages: JobPage[]
}

export interface CommittedOutput {
  outputDir: string
  mdFiles: string[]
  imageFiles: string[]
}

export interface JobStatus {
  id: string
  name: string
  mode: 'async' | 'sync'
  phase: JobPhase
  detail: string
  page?: number
  totalPages?: number
  part?: number
  totalParts?: number
  attempts?: number
  errorCode?: number
  error?: string
  results?: JobResults
  committed?: CommittedOutput
  createdAt: number
}
