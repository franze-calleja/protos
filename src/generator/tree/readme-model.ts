export class ReadmeModel {
  private sections: { title: string; body: string }[] = []

  section(title: string, body: string): void {
    if (this.sections.some((s) => s.title === title)) {
      throw new Error(`Duplicate section "${title}" in README`)
    }
    this.sections.push({ title, body })
  }

  render(projectName: string): string {
    const body = this.sections.map((s) => `## ${s.title}\n\n${s.body.trim()}\n`).join('\n')
    return `# ${projectName}\n\n${body}`
  }
}
