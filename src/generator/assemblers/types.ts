import type { FileTree } from '../tree/file-tree'
import type { AppSpec, LayoutId, ProtosConfig } from '../config/types'
import type { PackageManagerStrategy } from '../pm/types'

export interface BuiltApp {
  spec: AppSpec
  tree: FileTree
  isServer: boolean
}

export interface Deliverable {
  name: string
  files: Map<string, string>
}

export interface ComposeService {
  name: string
  build?: { context: string; dockerfile: string }
  image?: string
  ports?: string[]
  environment?: Record<string, string>
  dependsOn?: string[]
}

export interface DockerStrategy {
  /** The Dockerfile for one app, given its path within the deliverable. */
  dockerfile(app: BuiltApp, appPath: string): string
  /** The compose service entry for one app. */
  service(app: BuiltApp, appPath: string): ComposeService
}

export interface CiStrategy {
  workflow(apps: BuiltApp[], appPaths: Map<string, string>): string
}

export interface ProjectTree {
  root: FileTree
  apps: BuiltApp[]
  appPath(spec: AppSpec): string
}

export interface Assembler {
  id: LayoutId
  appPath(spec: AppSpec, cfg: ProtosConfig): string
  assemble(apps: BuiltApp[], cfg: ProtosConfig, root: FileTree): Deliverable[]
  dockerStrategy(pm: PackageManagerStrategy): DockerStrategy
  ciStrategy(pm: PackageManagerStrategy): CiStrategy
}
