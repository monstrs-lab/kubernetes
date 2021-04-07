import Operator                             from '@dot-i/k8s-operator'
import { ResourceEventType }                from '@dot-i/k8s-operator'
import { CustomObjectsApi }                 from '@kubernetes/client-node'
import { AppsV1Api }                        from '@kubernetes/client-node'
import { KubernetesObject }                 from '@kubernetes/client-node'

import { kustomize }                        from '@monstrs/k8s-kustomize-tool'
import { kubectl }                          from '@monstrs/k8s-kubectl-tool'
import { Logger }                           from '@monstrs/k8s-operator-logger'
import { kind2Plural }                      from '@monstrs/k8s-resource-utils'
import { deploymentResourceToSpec }         from '@monstrs/k8s-resource-utils'
import { serviceResourceToSpec }            from '@monstrs/k8s-resource-utils'

import { PreviewAutomationResourceVersion } from './preview-automation.types'
import { PreviewAutomationResourceGroup }   from './preview-automation.types'
import { PreviewVersionResourceVersion }    from './preview-version.types'
import { PreviewVersionResourceGroup }      from './preview-version.types'

export class PreviewOperator extends Operator {
  public static DOMAIN_GROUP = 'preview.monstrs.tech'

  private readonly log = new Logger(PreviewOperator.name)

  private readonly k8sCustomObjectsApi: CustomObjectsApi

  private readonly k8sAppApi: AppsV1Api

  constructor() {
    super(new Logger(PreviewOperator.name))

    this.k8sCustomObjectsApi = this.kubeConfig.makeApiClient(CustomObjectsApi)
    this.k8sAppApi = this.kubeConfig.makeApiClient(AppsV1Api)
  }

  async getAutomationResources(automation): Promise<Array<KubernetesObject>> {
    return Promise.all(
      // eslint-disable-next-line consistent-return
      automation.spec.resources.map(async (resource) => {
        if (resource.kind === 'Service') {
          const service = await this.k8sApi.readNamespacedService(
            resource.name,
            automation.metadata.namespace
          )

          return serviceResourceToSpec(service.body)
        }

        if (resource.kind === 'Deployment') {
          const deployment = await this.k8sAppApi.readNamespacedDeployment(
            resource.name,
            automation.metadata.namespace
          )

          return deploymentResourceToSpec(deployment.body)
        }
      })
    )
  }

  async buildPreview(event) {
    const { body: automation }: any = await this.k8sCustomObjectsApi.getNamespacedCustomObject(
      PreviewOperator.DOMAIN_GROUP,
      PreviewAutomationResourceVersion.v1alpha1,
      event.object.spec.previewAutomationRef.namespace || event.object.metadata.namespace,
      kind2Plural(PreviewAutomationResourceGroup.PreviewAutomation),
      event.object.spec.previewAutomationRef.name
    )

    const resources = await this.getAutomationResources(automation)

    const { body: imageRepository }: any = await this.k8sCustomObjectsApi.getNamespacedCustomObject(
      'image.toolkit.fluxcd.io',
      'v1alpha1',
      automation.spec.imageRepositoryRef.namespace || automation.metadata.namespace,
      'imagerepositories',
      automation.spec.imageRepositoryRef.name
    )

    const transformations = {
      images: [
        {
          name: imageRepository.spec.image,
          newTag: event.object.spec.tag,
        },
      ],
      namePrefix: 'preview-',
      nameSuffix: `-${event.object.spec.scope.id}`,
      commonLabels: {
        app: `preview-${event.object.spec.scope.id}`,
        'preview.monstrs.tech/scope.id': event.object.spec.scope.id,
      },
    }

    return kustomize.build(resources, transformations)
  }

  protected async init() {
    await this.watchResource(
      PreviewOperator.DOMAIN_GROUP,
      PreviewVersionResourceVersion.v1alpha1,
      kind2Plural(PreviewVersionResourceGroup.PreviewVersion),
      async (event) => {
        try {
          if (event.type === ResourceEventType.Added) {
            const preview = await this.buildPreview(event)

            await kubectl.apply(preview)
          } else if (event.type === ResourceEventType.Modified) {
            const preview = await this.buildPreview(event)

            await kubectl.apply(preview)
          } else if (event.type === ResourceEventType.Deleted) {
            const preview = await this.buildPreview(event)

            await kubectl.delete(preview)
          }
        } catch (error) {
          this.log.error(error)
        }
      }
    )
  }
}
