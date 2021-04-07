import { KubernetesObject } from '@kubernetes/client-node'

export interface ImageRepositorySpec {
  image: string
}

export interface ImageRepositoryResource extends KubernetesObject {
  spec: ImageRepositorySpec
}
