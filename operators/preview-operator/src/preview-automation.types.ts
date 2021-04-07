import { KubernetesObject } from '@kubernetes/client-node'

/* eslint-disable no-shadow */

export enum PreviewAutomationResourceVersion {
  v1alpha1 = 'v1alpha1',
}

export enum PreviewAutomationResourceKind {
  PreviewAutomation = 'PreviewAutomation',
}

export enum PreviewAutomationResourceGroup {
  PreviewAutomation = 'previewautomation',
}

export interface PreviewAutomationResourceSpec {
  kind: string
  name: string
  namespace?: string
}

export interface PreviewAutomationImageRepositoryRef {
  name: string
  namespace?: string
}

export interface PreviewAutomationSpec {
  resources: Array<PreviewAutomationResourceSpec>
  imageRepositoryRef: PreviewAutomationImageRepositoryRef
}

export interface PreviewAutomationResource extends KubernetesObject {
  spec: PreviewAutomationSpec
}
