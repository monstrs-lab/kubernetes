import { CustomObjectsApi }           from '@kubernetes/client-node'
import { KubeConfig }                 from '@kubernetes/client-node'

import { kind2Plural }                from '@monstrs/k8s-resource-utils'

import { ImagePolicyResource }        from './image-policy.interfaces'
import { ImagePolicyResourceVersion } from './image-policy.types'
import { ImagePolicyResourceGroup }   from './image-policy.types'
import { ImagePolicyDomain }          from './image-policy.types'

export class ImagePolicyApi {
  private readonly customObjectsApi: CustomObjectsApi

  constructor(private readonly kubeConfig: KubeConfig) {
    this.customObjectsApi = this.kubeConfig.makeApiClient(CustomObjectsApi)
  }

  async getImagePolicy(namespace: string, name: string): Promise<ImagePolicyResource> {
    const { body } = await this.customObjectsApi.getNamespacedCustomObject(
      ImagePolicyDomain.Group,
      ImagePolicyResourceVersion.v1beta1,
      namespace,
      kind2Plural(ImagePolicyResourceGroup.ImagePolicy),
      name
    )

    return body as ImagePolicyResource
  }

  async patchImagePolicy(namespace: string, name: string, body: object) {
    return this.customObjectsApi.patchNamespacedCustomObjectStatus(
      ImagePolicyDomain.Group,
      ImagePolicyResourceVersion.v1beta1,
      namespace,
      kind2Plural(ImagePolicyResourceGroup.ImagePolicy),
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
}
