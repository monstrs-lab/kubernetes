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
import { PreviewAutomationResource }        from './preview-automation.types'
import { ImageRepositoryResource }          from './image-repository.interfaces'
import { PreviewVersionResourceVersion }    from './preview-version.types'
import { PreviewVersionResourceGroup }      from './preview-version.types'
import { PreviewVersionStatusPhase }        from './preview-version.types'
import { PreviewVersionResource }           from './preview-version.types'
import { PreviewVersionStatus }             from './preview-version.types'

export class PreviewAutomationOperator extends Operator {
  public static DOMAIN_GROUP = 'preview.monstrs.tech'

  private readonly log = new Logger(PreviewAutomationOperator.name)

  private readonly k8sCustomObjectsApi: CustomObjectsApi

  private readonly k8sAppApi: AppsV1Api

  constructor() {
    super(new Logger(PreviewAutomationOperator.name))

    this.k8sCustomObjectsApi = this.kubeConfig.makeApiClient(CustomObjectsApi)
    this.k8sAppApi = this.kubeConfig.makeApiClient(AppsV1Api)
  }

  async getAutomationResources(
    automation: PreviewAutomationResource
  ): Promise<Array<KubernetesObject>> {
    return Promise.all(
      // eslint-disable-next-line consistent-return
      automation.spec.resources.map(async (resource) => {
        if (resource.kind === 'Service') {
          const service = await this.k8sApi.readNamespacedService(
            resource.name,
            automation.metadata?.namespace || 'default'
          )

          return serviceResourceToSpec(service.body)
        }

        if (resource.kind === 'Deployment') {
          const deployment = await this.k8sAppApi.readNamespacedDeployment(
            resource.name,
            automation.metadata?.namespace || 'default'
          )

          return deploymentResourceToSpec(deployment.body)
        }
      })
    )
  }

  private async getPreviewAutomation(
    previewVersion: PreviewVersionResource
  ): Promise<PreviewAutomationResource> {
    const { body } = await this.k8sCustomObjectsApi.getNamespacedCustomObject(
      PreviewAutomationOperator.DOMAIN_GROUP,
      PreviewAutomationResourceVersion.v1alpha1,
      previewVersion.spec.previewAutomationRef.namespace ||
        previewVersion.metadata?.namespace ||
        'default',
      kind2Plural(PreviewAutomationResourceGroup.PreviewAutomation),
      previewVersion.spec.previewAutomationRef.name
    )

    return body as PreviewAutomationResource
  }

  private async getImageRepository(
    automation: PreviewAutomationResource
  ): Promise<ImageRepositoryResource> {
    const { body } = await this.k8sCustomObjectsApi.getNamespacedCustomObject(
      'image.toolkit.fluxcd.io',
      'v1alpha1',
      automation.spec.imageRepositoryRef.namespace || automation.metadata?.namespace || 'default',
      'imagerepositories',
      automation.spec.imageRepositoryRef.name
    )

    return body as ImageRepositoryResource
  }

  async buildPreview(previewVersion: PreviewVersionResource) {
    const automation = await this.getPreviewAutomation(previewVersion)
    const resources = await this.getAutomationResources(automation)
    const imageRepository = await this.getImageRepository(automation)

    const transformations = {
      images: [
        {
          name: imageRepository.spec.image,
          newTag: previewVersion.spec.tag,
        },
      ],
      namePrefix: 'preview-',
      nameSuffix: `-${previewVersion.spec.scope.id}`,
      commonLabels: {
        app: `preview-${previewVersion.spec.scope.id}`,
      },
      commonAnnotations: {
        'preview.monstrs.tech/automated': 'true',
      },
    }

    return kustomize.build(resources, transformations)
  }

  async updateStatus(
    status: PreviewVersionStatus,
    resource: PreviewVersionResource
  ): Promise<void> {
    if (!resource.metadata?.name || !resource.metadata.namespace) return

    await this.k8sCustomObjectsApi.patchNamespacedCustomObjectStatus(
      PreviewAutomationOperator.DOMAIN_GROUP,
      PreviewVersionResourceVersion.v1alpha1,
      resource.metadata.namespace,
      kind2Plural(PreviewVersionResourceGroup.PreviewVersion),
      resource.metadata.name,
      [
        {
          op: 'replace',
          path: '/status',
          value: status,
        },
      ],
      undefined,
      undefined,
      undefined,
      {
        headers: { 'Content-Type': 'application/json-patch+json' },
      }
    )
  }

  protected async resourceModified(event) {
    const resource = event.object as PreviewVersionResource

    if (!resource.status || resource.status.observedGeneration !== resource.metadata?.generation) {
      this.updateStatus(
        {
          observedGeneration: resource.metadata?.generation,
          message: 'Updating preview version',
          phase: PreviewVersionStatusPhase.Pending,
          ready: false,
        },
        event.object as PreviewVersionResource
      )

      const preview = await this.buildPreview(event.object as PreviewVersionResource)

      await kubectl.apply(preview)

      await this.updateStatus(
        {
          observedGeneration: resource.metadata?.generation,
          message: 'Preview version updated',
          phase: PreviewVersionStatusPhase.Succeeded,
          ready: true,
        },
        event.object as PreviewVersionResource
      )
    }
  }

  protected async resourceDeleted(event) {
    const preview = await this.buildPreview(event.object as PreviewVersionResource)

    // TODO: check exists
    await kubectl.delete(preview)
  }

  protected async init() {
    await this.watchResource(
      PreviewAutomationOperator.DOMAIN_GROUP,
      PreviewVersionResourceVersion.v1alpha1,
      kind2Plural(PreviewVersionResourceGroup.PreviewVersion),
      async (event) => {
        try {
          if (event.type === ResourceEventType.Added || event.type === ResourceEventType.Modified) {
            const finalizer = `${kind2Plural(PreviewVersionResourceGroup.PreviewVersion)}.${
              PreviewAutomationOperator.DOMAIN_GROUP
            }`

            if (
              !(await this.handleResourceFinalizer(event, finalizer, (finalizerEvent) =>
                this.resourceDeleted(finalizerEvent)
              ))
            ) {
              await this.resourceModified(event)
            }
          }
        } catch (error) {
          this.log.error(error)

          await this.updateStatus(
            {
              observedGeneration: event.object.metadata?.generation,
              message: error.message?.toString() || '',
              phase: PreviewVersionStatusPhase.Failed,
              ready: false,
            },
            event.object as PreviewVersionResource
          )
        }
      }
    )
  }
}
