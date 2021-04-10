import Operator                          from '@dot-i/k8s-operator'
import { ResourceEventType }             from '@dot-i/k8s-operator'
import { Logger }                        from '@monstrs/logger'

import { PreviewAutomationApi }          from '@monstrs/k8s-preview-automation-api'
import { PreviewVersionApi }             from '@monstrs/k8s-preview-automation-api'
import { PreviewAutomationDomain }       from '@monstrs/k8s-preview-automation-api'
import { PreviewVersionResourceVersion } from '@monstrs/k8s-preview-automation-api'
import { PreviewVersionResourceGroup }   from '@monstrs/k8s-preview-automation-api'
import { PreviewVersionStatusPhase }     from '@monstrs/k8s-preview-automation-api'
import { PreviewVersionResource }        from '@monstrs/k8s-preview-automation-api'
import { ImageRepositoryApi }            from '@monstrs/k8s-flux-toolkit-api'
import { SourceApi }                     from '@monstrs/k8s-flux-toolkit-api'

import { kustomize }                     from '@monstrs/k8s-kustomize-tool'
import { kubectl }                       from '@monstrs/k8s-kubectl-tool'
import { OperatorLogger }                from '@monstrs/k8s-operator-logger'
import { kind2Plural }                   from '@monstrs/k8s-resource-utils'

export class PreviewAutomationOperator extends Operator {
  private readonly log = new Logger(PreviewAutomationOperator.name)

  private readonly previewAutomationApi: PreviewAutomationApi

  private readonly previewVersionApi: PreviewVersionApi

  private readonly imageRepositoryApi: ImageRepositoryApi

  private readonly sourceApi: SourceApi

  constructor() {
    super(new OperatorLogger(PreviewAutomationOperator.name))

    this.previewAutomationApi = new PreviewAutomationApi(this.kubeConfig)
    this.previewVersionApi = new PreviewVersionApi(this.kubeConfig)
    this.imageRepositoryApi = new ImageRepositoryApi(this.kubeConfig)
    this.sourceApi = new SourceApi(this.kubeConfig)
  }

  async buildPreview(previewVersion: PreviewVersionResource) {
    const automation = await this.previewAutomationApi.getPreviewAutomation(
      previewVersion.spec.previewAutomationRef.namespace ||
        previewVersion.metadata?.namespace ||
        'default',
      previewVersion.spec.previewAutomationRef.name
    )

    const imageRepository = await this.imageRepositoryApi.getImageRepository(
      automation.spec.imageRepositoryRef.namespace || automation.metadata?.namespace || 'default',
      automation.spec.imageRepositoryRef.name
    )

    const source = await this.sourceApi.getGitRepository(
      automation.spec.sourceRef.namespace || automation.metadata?.namespace || 'default',
      automation.spec.sourceRef.name
    )

    const resources = await this.previewAutomationApi.getPreviewAutomationResources(automation)

    const transformations = {
      images: [
        {
          name: imageRepository.spec.image,
          newTag: previewVersion.spec.tag,
        },
      ],
      namePrefix: 'preview-',
      nameSuffix: `-${previewVersion.spec.context.number}`,
      commonLabels: {
        app: `preview-${previewVersion.spec.context.number}`,
      },
      commonAnnotations: {
        'preview.monstrs.tech/automation': automation.metadata!.name,
        'preview.monstrs.tech/host': `${automation.metadata!.name}-${
          previewVersion.spec.context.number
        }.${automation.spec.endpoint.domain}`,
        'preview.monstrs.tech/context': JSON.stringify(previewVersion.spec.context),
        'preview.monstrs.tech/source': JSON.stringify({
          kind: 'GitRepository',
          url: source.spec.url,
        }),
      },
    }

    return kustomize.build(resources, transformations)
  }

  protected async resourceModified(event) {
    const resource = event.object as PreviewVersionResource

    if (!resource.status || resource.status.observedGeneration !== resource.metadata?.generation) {
      await this.previewVersionApi.updatePreviewVersionStatus(
        resource.metadata?.namespace || 'default',
        resource.metadata!.name!,
        {
          observedGeneration: resource.metadata?.generation,
          message: 'Updating preview version',
          phase: PreviewVersionStatusPhase.Pending,
          ready: false,
        }
      )

      const preview = await this.buildPreview(resource)

      await kubectl.apply(preview)

      await this.previewVersionApi.updatePreviewVersionStatus(
        resource.metadata?.namespace || 'default',
        resource.metadata!.name!,
        {
          observedGeneration: resource.metadata?.generation,
          message: 'Preview version updated',
          phase: PreviewVersionStatusPhase.Succeeded,
          ready: true,
        }
      )
    }
  }

  protected async resourceDeleted(event) {
    try {
      const preview = await this.buildPreview(event.object as PreviewVersionResource)

      // TODO: check exists
      await kubectl.delete(preview)
    } catch (error) {
      this.log.error(error.body || error)
    }
  }

  protected async init() {
    await this.watchResource(
      PreviewAutomationDomain.Group,
      PreviewVersionResourceVersion.v1alpha1,
      kind2Plural(PreviewVersionResourceGroup.PreviewVersion),
      async (event) => {
        try {
          if (event.type === ResourceEventType.Added || event.type === ResourceEventType.Modified) {
            const finalizer = `${kind2Plural(PreviewVersionResourceGroup.PreviewVersion)}.${
              PreviewAutomationDomain.Group
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
          this.log.error(error.body || error)

          await this.previewVersionApi.updatePreviewVersionStatus(
            event.object.metadata?.namespace || 'default',
            event.object.metadata!.name!,
            {
              observedGeneration: event.object.metadata?.generation,
              message: error.message?.toString() || '',
              phase: PreviewVersionStatusPhase.Failed,
              ready: false,
            }
          )
        }
      }
    )
  }
}
