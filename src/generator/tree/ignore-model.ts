export class IgnoreModel {
  private patterns: string[] = []

  add(pattern: string): void {
    if (!this.patterns.includes(pattern)) this.patterns.push(pattern)
  }

  render(): string {
    return this.patterns.map((p) => `${p}\n`).join('')
  }
}
