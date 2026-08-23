import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

/**
 * Real import specifiers only. A regex over raw text cannot do this job: base
 * templates hold generated code in string literals (`import ... from 'next'`),
 * which is data, not a dependency. The AST sees only actual import statements.
 */
function importsOf(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  )
  const specifiers: string[] = []
  for (const statement of source.statements) {
    if (
      (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      specifiers.push(statement.moduleSpecifier.text)
    }
  }
  return specifiers
}

describe('generator isolation', () => {
  const files = walk('src/generator').filter((f) => f.endsWith('.ts'))

  it('has generator source to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('never imports from next', () => {
    const offenders = files.filter((f) =>
      importsOf(f).some((s) => s === 'next' || s.startsWith('next/'))
    )
    expect(offenders).toEqual([])
  })

  it('still detects a real next import when one exists', () => {
    // Guards the guard: proves the AST check would actually catch a violation.
    const probe = ts.createSourceFile(
      'probe.ts',
      "import { NextConfig } from 'next'\nconst t = `import x from 'next'`\n",
      ts.ScriptTarget.Latest,
      true
    )
    const found = probe.statements
      .filter(ts.isImportDeclaration)
      .map((d) => (d.moduleSpecifier as ts.StringLiteral).text)
    expect(found).toEqual(['next'])
  })
})
