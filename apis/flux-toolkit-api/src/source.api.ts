import { CustomObjectsApi }             from '@kubernetes/client-node'
import { KubeConfig }                   from '@kubernetes/client-node'

import { kind2Plural }                  from '@monstrs/k8s-resource-utils'

import { GitRepositoryResource }        from './source.interfaces'
import { GitRepositoryResourceVersion } from './source.types'
import { GitRepositoryResourceGroup }   from './source.types'
import { SourceDomain }                 from './source.types'

export class SourceApi {
  private readonly customObjectsApi: CustomObjectsApi

  constructor(private readonly kubeConfig: KubeConfig) {
    this.customObjectsApi = this.kubeConfig.makeApiClient(CustomObjectsApi)
  }

  async getGitRepository(
    name: string,
    namespace: string = 'default'
  ): Promise<GitRepositoryResource> {
    const { body } = await this.customObjectsApi.getNamespacedCustomObject(
      SourceDomain.Group,
      GitRepositoryResourceVersion.v1beta1,
      namespace,
      kind2Plural(GitRepositoryResourceGroup.GitRepository),
      name
    )

    return body as GitRepositoryResource
  }
}
