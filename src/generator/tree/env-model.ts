export interface EnvOptions {
  comment?: string
  /** Value written to .env.example. Defaults to empty — never leak a real value. */
  placeholder?: string
}

interface EnvEntry {
  key: string
  value: string
  comment?: string
  placeholder: string
}

export class EnvModel {
  private entries: EnvEntry[] = []

  set(key: string, value: string, opts: EnvOptions = {}): void {
    const existing = this.entries.find((e) => e.key === key)
    if (existing) {
      if (existing.value !== value) {
        throw new Error(`Conflicting value for env key "${key}"`)
      }
      return
    }
    this.entries.push({ key, value, comment: opts.comment, placeholder: opts.placeholder ?? '' })
  }

  keys(): string[] {
    return this.entries.map((e) => e.key)
  }

  render(): { env: string; example: string } {
    const build = (pick: (e: EnvEntry) => string) =>
      this.entries
        .map((e) => `${e.comment ? `# ${e.comment}\n` : ''}${e.key}=${pick(e)}\n`)
        .join('')
    return { env: build((e) => e.value), example: build((e) => e.placeholder) }
  }
}
