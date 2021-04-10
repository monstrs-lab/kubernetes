import { KubernetesObject } from '@kubernetes/client-node'

export interface GitRepositorySpec {
  url: string
}

export interface GitRepositoryResource extends KubernetesObject {
  spec: GitRepositorySpec
}
