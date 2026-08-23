import { describe, it, expect } from 'vitest'
import { ReadmeModel } from '@/generator/tree/readme-model'

describe('ReadmeModel', () => {
  it('renders the project name as an H1 followed by sections', () => {
    const r = new ReadmeModel()
    r.section('Getting started', 'Run `npm run dev`.')
    expect(r.render('hrims')).toBe('# hrims\n\n## Getting started\n\nRun `npm run dev`.\n')
  })

  it('renders sections in insertion order', () => {
    const r = new ReadmeModel()
    r.section('First', 'a')
    r.section('Second', 'b')
    const out = r.render('x')
    expect(out.indexOf('## First')).toBeLessThan(out.indexOf('## Second'))
  })

  it('throws when the same section title is added twice', () => {
    const r = new ReadmeModel()
    r.section('Setup', 'a')
    expect(() => r.section('Setup', 'b')).toThrow(/duplicate section/i)
  })
})
