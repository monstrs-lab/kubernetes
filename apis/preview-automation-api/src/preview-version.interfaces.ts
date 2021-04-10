import { KubernetesObject } from '@kubernetes/client-node'

// eslint-disable-next-line no-shadow
export enum PreviewVersionStatusPhase {
  Failed = 'Failed',
  Pending = 'Pending',
  Succeeded = 'Succeeded',
  Unknown = 'Unknown',
}

export interface PreviewVersionStatus {
  observedGeneration?: number
  lastUpdateTime?: string
  message?: string
  phase?: PreviewVersionStatusPhase
  ready?: boolean
}

export interface PreviewVersionSpecAutomationRef {
  name: string
  namespace: string
}

export interface PreviewVersionSpecContext {
  kind: string
  number: string
}

export interface PreviewVersionSpec {
  previewAutomationRef: PreviewVersionSpecAutomationRef
  context: PreviewVersionSpecContext
  tag: string
}

export interface PreviewVersionResource extends KubernetesObject {
  spec: PreviewVersionSpec
  status: PreviewVersionStatus
}
