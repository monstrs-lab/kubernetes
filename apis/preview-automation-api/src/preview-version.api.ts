import { CustomObjectsApi }              from '@kubernetes/client-node'
import { KubeConfig }                    from '@kubernetes/client-node'

import { kind2Plural }                   from '@monstrs/k8s-resource-utils'

import { PreviewAutomationDomain }       from './preview-domain.types'
import { PreviewVersionResource }        from './preview-version.interfaces'
import { PreviewVersionStatus }          from './preview-version.interfaces'
import { PreviewVersionSpec }            from './preview-version.interfaces'
import { PreviewVersionResourceVersion } from './preview-version.types'
import { PreviewVersionResourceGroup }   from './preview-version.types'
import { PreviewVersionResourceKind }    from './preview-version.types'

export class PreviewVersionApi {
  private readonly customObjectsApi: CustomObjectsApi

  constructor(private readonly kubeConfig: KubeConfig) {
    this.customObjectsApi = this.kubeConfig.makeApiClient(CustomObjectsApi)
  }

  async getPreviewVersion(
    name: string,
    namespace: string = 'default'
  ): Promise<PreviewVersionResource> {
    const { body } = await this.customObjectsApi.getNamespacedCustomObject(
      PreviewAutomationDomain.Group,
      PreviewVersionResourceVersion.v1alpha1,
      namespace,
      kind2Plural(PreviewVersionResourceGroup.PreviewVersion),
      name
    )

    return body as PreviewVersionResource
  }

  async createPreviewVersion(
    name: string,
    spec: PreviewVersionSpec,
    namespace: string = 'default'
  ) {
    return this.customObjectsApi.createNamespacedCustomObject(
      PreviewAutomationDomain.Group,
      PreviewVersionResourceVersion.v1alpha1,
      namespace,
      kind2Plural(PreviewVersionResourceGroup.PreviewVersion),
      {
        apiVersion: `${PreviewAutomationDomain.Group}/${PreviewVersionResourceVersion.v1alpha1}`,
        kind: PreviewVersionResourceKind.PreviewVersion,
        metadata: {
          namespace,
          name,
        },
        spec,
      }
    )
  }

  patchPreviewVersion(name: string, body: object, namespace: string = 'default') {
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

  deletePreviewVersion(name: string, namespace: string = 'default') {
    return this.customObjectsApi.deleteNamespacedCustomObject(
      PreviewAutomationDomain.Group,
      PreviewVersionResourceVersion.v1alpha1,
      namespace,
      kind2Plural(PreviewVersionResourceGroup.PreviewVersion),
      name
    )
  }

  updatePreviewVersionStatus(
    name: string,
    status: PreviewVersionStatus,
    namespace: string = 'default'
  ) {
    return this.patchPreviewVersion(
      name,
      [
        {
          op: 'replace',
          path: '/status',
          value: status,
        },
      ],
      namespace
    )
  }
}
