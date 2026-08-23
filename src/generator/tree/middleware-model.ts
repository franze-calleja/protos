export interface MiddlewareEntry {
  /** The expression passed to app.use(), e.g. `helmet()`. */
  expr: string
  importName?: string
  importFrom?: string
  order: number
}

export class MiddlewareModel {
  private entries: MiddlewareEntry[] = []

  push(entry: MiddlewareEntry): void {
    this.entries.push(entry)
  }

  imports(): string {
    return [...this.entries]
      .filter((e) => e.importName && e.importFrom)
      .sort((a, b) => a.importFrom!.localeCompare(b.importFrom!))
      .map((e) => `import ${e.importName} from '${e.importFrom}'\n`)
      .join('')
  }

  statements(): string {
    return [...this.entries]
      .sort((a, b) => a.order - b.order)
      .map((e) => `app.use(${e.expr})\n`)
      .join('')
  }
}
