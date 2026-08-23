export interface ProviderEntry {
  component: string
  importName: string
  importFrom: string
  /** Lower numbers nest further out. Keeps nesting deterministic. */
  order: number
  props?: string
}

export class ProviderModel {
  private entries: ProviderEntry[] = []

  push(entry: ProviderEntry): void {
    this.entries.push(entry)
  }

  isEmpty(): boolean {
    return this.entries.length === 0
  }

  imports(): string {
    return [...this.entries]
      .sort((a, b) => a.importFrom.localeCompare(b.importFrom))
      .map((e) => `import { ${e.importName} } from '${e.importFrom}'\n`)
      .join('')
  }

  wrap(children: string): string {
    return [...this.entries]
      .sort((a, b) => a.order - b.order)
      .reduceRight(
        (inner, e) => `<${e.component}${e.props ? ` ${e.props}` : ''}>${inner}</${e.component}>`,
        children
      )
  }
}
