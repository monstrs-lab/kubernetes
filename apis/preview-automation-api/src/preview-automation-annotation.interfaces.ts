import { PreviewVersionSpecContext } from './preview-version.interfaces'

export interface PreviewAutomationAnnotationSource {
  kind: string
  url: string
}

export interface PreviewAutomationAnnotationEndpoint {
  name: string
  namespace: string
  hosts: Array<string>
}

export interface PreviewAutomationAnnotation {
  name: string
  context: PreviewVersionSpecContext
  source: PreviewAutomationAnnotationSource
  endpoint?: PreviewAutomationAnnotationEndpoint
}
