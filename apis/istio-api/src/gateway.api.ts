import { CustomObjectsApi }       from '@kubernetes/client-node'
import { KubeConfig }             from '@kubernetes/client-node'

import { kind2Plural }            from '@monstrs/k8s-resource-utils'

import { GatewayResource }        from './gateway.interfaces'
import { GatewaySpec }            from './gateway.interfaces'
import { GatewayResourceVersion } from './gateway.types'
import { GatewayResourceGroup }   from './gateway.types'
import { GatewayResourceKind }    from './gateway.types'
import { GatewayDomain }          from './gateway.types'

export class GatewayApi {
  private readonly customObjectsApi: CustomObjectsApi

  constructor(private readonly kubeConfig: KubeConfig) {
    this.customObjectsApi = this.kubeConfig.makeApiClient(CustomObjectsApi)
  }

  async getGateway(namespace: string, name: string): Promise<GatewayResource> {
    const { body } = await this.customObjectsApi.getNamespacedCustomObject(
      GatewayDomain.Group,
      GatewayResourceVersion.v1alpha2,
      namespace,
      kind2Plural(GatewayResourceGroup.Gateway),
      name
    )

    return body as GatewayResource
  }

  async createGateway(namespace: string, name: string, spec: GatewaySpec) {
    return this.customObjectsApi.createNamespacedCustomObject(
      GatewayDomain.Group,
      GatewayResourceVersion.v1alpha2,
      namespace,
      kind2Plural(GatewayResourceGroup.Gateway),
      {
        apiVersion: `${GatewayDomain.Group}/${GatewayResourceVersion.v1alpha2}`,
        kind: GatewayResourceKind.Gateway,
        metadata: {
          namespace,
          name,
        },
        spec,
      }
    )
  }

  async patchGateway(namespace: string, name: string, body: object) {
    return this.customObjectsApi.patchNamespacedCustomObjectStatus(
      GatewayDomain.Group,
      GatewayResourceVersion.v1alpha2,
      namespace,
      kind2Plural(GatewayResourceGroup.Gateway),
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

  async deleteGateway(namespace: string, name: string) {
    return this.customObjectsApi.deleteNamespacedCustomObject(
      GatewayDomain.Group,
      GatewayResourceVersion.v1alpha2,
      namespace,
      kind2Plural(GatewayResourceGroup.Gateway),
      name
    )
  }
}
