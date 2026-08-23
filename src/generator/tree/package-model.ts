export class PackageModel {
  private name = 'app'
  private deps = new Map<string, string>()
  private devDeps = new Map<string, string>()
  private scripts = new Map<string, string>()
  private extras: Record<string, unknown> = {}

  setName(name: string): void {
    this.name = name
  }

  addDep(name: string, version: string): void {
    addTo(this.deps, name, version, 'dependency')
  }

  addDevDep(name: string, version: string): void {
    addTo(this.devDeps, name, version, 'devDependency')
  }

  addScript(name: string, command: string): void {
    const existing = this.scripts.get(name)
    if (existing && existing !== command) {
      throw new Error(`Conflicting script "${name}": "${existing}" vs "${command}"`)
    }
    this.scripts.set(name, command)
  }

  /** For top-level fields a base needs, e.g. `type: "module"`. */
  set(key: string, value: unknown): void {
    this.extras[key] = value
  }

  render(): string {
    const json: Record<string, unknown> = {
      name: this.name,
      version: '0.1.0',
      private: true,
      ...this.extras,
    }
    if (this.scripts.size) json.scripts = sorted(this.scripts)
    if (this.deps.size) json.dependencies = sorted(this.deps)
    if (this.devDeps.size) json.devDependencies = sorted(this.devDeps)
    return `${JSON.stringify(json, null, 2)}\n`
  }
}

function addTo(map: Map<string, string>, name: string, version: string, kind: string): void {
  const existing = map.get(name)
  if (existing && existing !== version) {
    throw new Error(`Conflicting version for ${kind} "${name}": "${existing}" vs "${version}"`)
  }
  map.set(name, version)
}

function sorted(map: Map<string, string>): Record<string, string> {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)))
}
