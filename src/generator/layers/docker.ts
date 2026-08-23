import { registerRootLayer } from './root-registry'
import type { RootCtx, RootLayer } from './root-types'
import type { ComposeService, ProjectTree } from '../assemblers/types'

const DOCKERIGNORE = `node_modules
.next
dist
.git
.env
`

const DB_SERVICES: Record<string, ComposeService> = {
  postgres: {
    name: 'db',
    image: 'postgres:17-alpine',
    ports: ['5432:5432'],
    environment: {
      POSTGRES_USER: 'postgres',
      POSTGRES_PASSWORD: 'postgres',
      POSTGRES_DB: 'app',
    },
  },
  mysql: {
    name: 'db',
    image: 'mysql:8',
    ports: ['3306:3306'],
    environment: {
      MYSQL_ROOT_PASSWORD: 'root',
      MYSQL_DATABASE: 'app',
    },
  },
}

export const dockerRootLayer: RootLayer = {
  id: 'docker',
  label: 'Docker',
  description: 'Dockerfile per app plus a compose file that starts everything',
  requiresServerApp: true,
  manifest: ['docker-compose.yml', 'Dockerfile', '.dockerignore'],

  applyRoot(project: ProjectTree, ctx: RootCtx): void {
    const services: ComposeService[] = []

    for (const app of project.apps) {
      if (!app.isServer) continue
      const appPath = project.appPath(app.spec)
      app.tree.write('Dockerfile', ctx.docker.dockerfile(app, appPath))
      app.tree.write('.dockerignore', DOCKERIGNORE)
      services.push(ctx.docker.service(app, appPath))
    }

    // A database service is added because an app actually declared one,
    // not because a checkbox was ticked.
    const dbApp = project.apps.find((a) => a.tree.env.keys().includes('DATABASE_URL'))
    if (dbApp) {
      const kind = dbApp.spec.options.db ?? 'postgres'
      const service = DB_SERVICES[kind]
      if (service) {
        services.push(service)
        for (const s of services) {
          if (s.name !== 'db') s.dependsOn = ['db']
        }
      }
    }

    project.root.write('docker-compose.yml', renderCompose(services))
  },
}

function renderCompose(services: ComposeService[]): string {
  const body = services
    .map((s) => {
      const lines = [`  ${s.name}:`]
      if (s.image) lines.push(`    image: ${s.image}`)
      if (s.build) {
        lines.push('    build:', `      context: ${s.build.context}`, `      dockerfile: ${s.build.dockerfile}`)
      }
      if (s.ports?.length) lines.push('    ports:', ...s.ports.map((p) => `      - '${p}'`))
      if (s.environment) {
        lines.push('    environment:')
        for (const [k, v] of Object.entries(s.environment)) lines.push(`      ${k}: ${v}`)
      }
      if (s.dependsOn?.length) lines.push('    depends_on:', ...s.dependsOn.map((d) => `      - ${d}`))
      return lines.join('\n')
    })
    .join('\n')

  return `services:\n${body}\n`
}

registerRootLayer(dockerRootLayer)
