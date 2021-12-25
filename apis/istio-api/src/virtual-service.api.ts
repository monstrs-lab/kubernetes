import { CustomObjectsApi }              from '@kubernetes/client-node'
import { KubeConfig }                    from '@kubernetes/client-node'

import { kind2Plural }                   from '@monstrs/k8s-resource-utils'

import { VirtualServiceResource }        from './virtual-service.interfaces'
import { VirtualServiceSpec }            from './virtual-service.interfaces'
import { VirtualServiceResourceVersion } from './virtual-service.types'
import { VirtualServiceResourceGroup }   from './virtual-service.types'
import { VirtualServiceResourceKind }    from './virtual-service.types'
import { VirtualServiceDomain }          from './virtual-service.types'

export class VirtualServiceApi {
  private readonly customObjectsApi: CustomObjectsApi

  constructor(private readonly kubeConfig: KubeConfig) {
    this.customObjectsApi = this.kubeConfig.makeApiClient(CustomObjectsApi)
  }

  async getVirtualService(namespace: string, name: string): Promise<VirtualServiceResource> {
    const { body } = await this.customObjectsApi.getNamespacedCustomObject(
      VirtualServiceDomain.Group,
      VirtualServiceResourceVersion.v1alpha2,
      namespace,
      kind2Plural(VirtualServiceResourceGroup.VirtualService),
      name
    )

    return body as VirtualServiceResource
  }

  async createVirtualService(namespace: string, name: string, spec: VirtualServiceSpec) {
    return this.customObjectsApi.createNamespacedCustomObject(
      VirtualServiceDomain.Group,
      VirtualServiceResourceVersion.v1alpha2,
      namespace,
      kind2Plural(VirtualServiceResourceGroup.VirtualService),
      {
        apiVersion: `${VirtualServiceDomain.Group}/${VirtualServiceResourceVersion.v1alpha2}`,
        kind: VirtualServiceResourceKind.VirtualService,
        metadata: {
          namespace,
          name,
        },
        spec,
      }
    )
  }

  async patchVirtualService(namespace: string, name: string, body: object) {
    return this.customObjectsApi.patchNamespacedCustomObjectStatus(
      VirtualServiceDomain.Group,
      VirtualServiceResourceVersion.v1alpha2,
      namespace,
      kind2Plural(VirtualServiceResourceGroup.VirtualService),
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

  async deleteVirtualService(namespace: string, name: string) {
    return this.customObjectsApi.deleteNamespacedCustomObject(
      VirtualServiceDomain.Group,
      VirtualServiceResourceVersion.v1alpha2,
      namespace,
      kind2Plural(VirtualServiceResourceGroup.VirtualService),
      name
    )
  }
}
