import { IgnoreModel } from './ignore-model'
import { PackageModel } from './package-model'
import { EnvModel } from './env-model'
import { ReadmeModel } from './readme-model'
import { ProviderModel } from './provider-model'
import { MiddlewareModel } from './middleware-model'

export interface WriteOptions {
  /** Explicitly replace an existing file. Layers must not use this on another layer's file. */
  overwrite?: boolean
}

export class FileTree {
  private files = new Map<string, string>()

  readonly pkg = new PackageModel()
  readonly env = new EnvModel()
  readonly readme = new ReadmeModel()
  readonly providers = new ProviderModel()
  readonly middleware = new MiddlewareModel()
  readonly ignore = new IgnoreModel()

  write(rawPath: string, content: string, opts: WriteOptions = {}): void {
    const path = normalise(rawPath)
    if (this.files.has(path) && !opts.overwrite) {
      throw new Error(
        `File "${path}" was already written. Layers must not patch each other's files — use a structured model instead.`
      )
    }
    this.files.set(path, content)
  }

  exists(rawPath: string): boolean {
    return this.files.has(normalise(rawPath))
  }

  read(rawPath: string): string | undefined {
    return this.files.get(normalise(rawPath))
  }

  paths(): string[] {
    return [...this.files.keys()].sort()
  }

  toMap(): Map<string, string> {
    return new Map(this.paths().map((p) => [p, this.files.get(p)!]))
  }
}

function normalise(path: string): string {
  const clean = path.replace(/^\/+/, '')
  if (clean.split('/').includes('..')) {
    throw new Error(`Path traversal rejected: "${path}"`)
  }
  return clean
}
