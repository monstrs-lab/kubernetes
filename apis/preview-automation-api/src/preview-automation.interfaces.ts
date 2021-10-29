import { KubernetesObject } from '@kubernetes/client-node'

export interface PreviewAutomationResourceSpec {
  kind: string
  name: string
  namespace?: string
  version?: string
}

export interface PreviewAutomationImageRepositoryRef {
  name: string
  namespace?: string
}

export interface PreviewAutomationSourceRef {
  kind: string
  name: string
  namespace?: string
}

export interface PreviewAutomationEndpointRef {
  name: string
  namespace?: string
}

export interface PreviewAutomationEndpoint {
  domain: string
}

export interface PreviewAutomationGatewayRef {
  name: string
  namespace?: string
}

export interface PreviewAutomationSpec {
  endpoint: PreviewAutomationEndpoint
  sourceRef: PreviewAutomationSourceRef
  resources: Array<PreviewAutomationResourceSpec>
  endpointRef?: PreviewAutomationEndpointRef
  gatewayRef?: PreviewAutomationGatewayRef
  imageRepositoryRef: PreviewAutomationImageRepositoryRef
}

export interface PreviewAutomationResource extends KubernetesObject {
  spec: PreviewAutomationSpec
}
