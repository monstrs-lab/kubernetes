import { KubernetesObject } from '@kubernetes/client-node'

export interface PreviewEndpointSpec {
  url: string
}

export interface PreviewEndpointResource extends KubernetesObject {
  spec: PreviewEndpointSpec
}
