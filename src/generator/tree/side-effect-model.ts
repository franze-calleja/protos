/**
 * Imports that exist for their side effects rather than their bindings —
 * a stylesheet, a polyfill. A layer writes the file and registers it here;
 * the base decides where the import statement actually goes.
 */
export class SideEffectImportModel {
  private paths: string[] = []

  add(appRelativePath: string): void {
    if (!this.paths.includes(appRelativePath)) this.paths.push(appRelativePath)
  }

  list(): string[] {
    return [...this.paths].sort()
  }

  isEmpty(): boolean {
    return this.paths.length === 0
  }
}
