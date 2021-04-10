import { CustomObjectsApi }              from '@kubernetes/client-node'
import { KubeConfig }                    from '@kubernetes/client-node'

import { kind2Plural }                   from '@monstrs/k8s-resource-utils'

import { PreviewVersionResource }        from './preview-version.interfaces'
import { PreviewVersionStatus }          from './preview-version.interfaces'
import { PreviewVersionResourceVersion } from './preview-version.types'
import { PreviewVersionResourceGroup }   from './preview-version.types'
import { PreviewAutomationDomain }       from './preview-domain.types'

export class PreviewVersionApi {
  private readonly customObjectsApi: CustomObjectsApi

  constructor(private readonly kubeConfig: KubeConfig) {
    this.customObjectsApi = this.kubeConfig.makeApiClient(CustomObjectsApi)
  }

  async getPreviewVersion(namespace: string, name: string): Promise<PreviewVersionResource> {
    const { body } = await this.customObjectsApi.getNamespacedCustomObject(
      PreviewAutomationDomain.Group,
      PreviewVersionResourceVersion.v1alpha1,
      namespace,
      kind2Plural(PreviewVersionResourceGroup.PreviewVersion),
      name
    )

    return body as PreviewVersionResource
  }

  async patchPreviewVersion(namespace: string, name: string, body: object) {
    return this.customObjectsApi.patchNamespacedCustomObjectStatus(
      PreviewAutomationDomain.Group,
      PreviewVersionResourceVersion.v1alpha1,
      namespace,
      kind2Plural(PreviewVersionResourceGroup.PreviewVersion),
      name,
      body,
      undefined,
      undefined,
      undefined,
      {
        headers: { 'Content-Type': 'application/json-patch+json' },
      }
    )
  }

  async updatePreviewVersionStatus(namespace: string, name: string, status: PreviewVersionStatus) {
    return this.patchPreviewVersion(namespace, name, [
      {
        op: 'replace',
        path: '/status',
        value: status,
      },
    ])
  }
}
