export const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "commonjs",
    "moduleResolution": "node10",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
`

export const INDEX = `import { app } from './app'

const port = Number(process.env.PORT ?? 3000)

app.listen(port, () => {
  console.log(\`listening on http://localhost:\${port}\`)
})
`

export const HEALTH_SERVICE = `export interface Health {
  status: 'ok'
  uptime: number
}

export function getHealth(): Health {
  return { status: 'ok', uptime: process.uptime() }
}
`
