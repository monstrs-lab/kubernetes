import { CustomObjectsApi }               from '@kubernetes/client-node'
import { KubeConfig }                     from '@kubernetes/client-node'

import { kind2Plural }                    from '@monstrs/k8s-resource-utils'

import { PreviewEndpointResource }        from './preview-endpoint.interfaces'
import { PreviewEndpointSpec }            from './preview-endpoint.interfaces'
import { PreviewEndpointResourceVersion } from './preview-endpoint.types'
import { PreviewEndpointResourceGroup }   from './preview-endpoint.types'
import { PreviewEndpointResourceKind }    from './preview-endpoint.types'
import { PreviewAutomationDomain }        from './preview-domain.types'

export class PreviewEndpointApi {
  private readonly customObjectsApi: CustomObjectsApi

  constructor(private readonly kubeConfig: KubeConfig) {
    this.customObjectsApi = this.kubeConfig.makeApiClient(CustomObjectsApi)
  }

  async getPreviewEndpoint(namespace: string, name: string): Promise<PreviewEndpointResource> {
    const { body } = await this.customObjectsApi.getNamespacedCustomObject(
      PreviewAutomationDomain.Group,
      PreviewEndpointResourceVersion.v1alpha1,
      namespace,
      kind2Plural(PreviewEndpointResourceGroup.PreviewEndpoint),
      name
    )

    return body as PreviewEndpointResource
  }

  async createPreviewEndpoint(namespace: string, name: string, spec: PreviewEndpointSpec) {
    return this.customObjectsApi.createNamespacedCustomObject(
      PreviewAutomationDomain.Group,
      PreviewEndpointResourceVersion.v1alpha1,
      namespace,
      kind2Plural(PreviewEndpointResourceGroup.PreviewEndpoint),
      {
        apiEndpoint: `${PreviewAutomationDomain.Group}/${PreviewEndpointResourceVersion.v1alpha1}`,
        kind: PreviewEndpointResourceKind.PreviewEndpoint,
        metadata: {
          namespace,
          name,
        },
        spec,
      }
    )
  }

  async patchPreviewEndpoint(namespace: string, name: string, body: object) {
    return this.customObjectsApi.patchNamespacedCustomObjectStatus(
      PreviewAutomationDomain.Group,
      PreviewEndpointResourceVersion.v1alpha1,
      namespace,
      kind2Plural(PreviewEndpointResourceGroup.PreviewEndpoint),
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

  async deletePreviewEndpoint(namespace: string, name: string) {
    return this.customObjectsApi.deleteNamespacedCustomObject(
      PreviewAutomationDomain.Group,
      PreviewEndpointResourceVersion.v1alpha1,
      namespace,
      kind2Plural(PreviewEndpointResourceGroup.PreviewEndpoint),
      name
    )
  }
}
