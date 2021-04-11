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
import { PreviewEndpointApi }            from '@monstrs/k8s-preview-automation-api'
import { ImageRepositoryApi }            from '@monstrs/k8s-flux-toolkit-api'
import { SourceApi }                     from '@monstrs/k8s-flux-toolkit-api'

import { kustomize }                     from '@monstrs/k8s-kustomize-tool'
import { kubectl }                       from '@monstrs/k8s-kubectl-tool'
import { OperatorLogger }                from '@monstrs/k8s-operator-logger'
import { kind2Plural }                   from '@monstrs/k8s-resource-utils'

export class PreviewAutomationOperator extends Operator {
  private readonly log = new Logger(PreviewAutomationOperator.name)

  private readonly previewAutomationApi: PreviewAutomationApi

  private readonly previewEndpointApi: PreviewEndpointApi

  private readonly previewVersionApi: PreviewVersionApi

  private readonly imageRepositoryApi: ImageRepositoryApi

  private readonly sourceApi: SourceApi

  constructor() {
    super(new OperatorLogger(PreviewAutomationOperator.name))

    this.previewAutomationApi = new PreviewAutomationApi(this.kubeConfig)
    this.previewEndpointApi = new PreviewEndpointApi(this.kubeConfig)
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

    const endpoint = automation.spec.endpointRef
      ? await this.previewEndpointApi.getPreviewEndpoint(
          automation.spec.endpointRef.namespace || automation.metadata?.namespace || 'default',
          automation.spec.endpointRef.name
        )
      : null

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
        app: `preview-${previewVersion.metadata!.name}-${previewVersion.spec.context.number}`,
      },
      commonAnnotations: {
        'preview.monstrs.tech/automation': JSON.stringify({
          name: automation.metadata!.name,
          endpoint: endpoint ? endpoint.spec : null,
          context: previewVersion.spec.context,
          source: {
            kind: source.kind,
            url: source.spec.url,
          },
        }),
      },
    }

    return kustomize.build(resources, transformations)
  }

  protected async resourceModified(resource) {
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

  protected async resourceDeleted(resource: PreviewVersionResource) {
    try {
      const output = await kubectl.run([
        'delete',
        'all',
        '-n',
        resource.metadata?.namespace || 'default',
        '-l',
        `app=preview-${resource.metadata!.name}-${resource.spec.context.number}`,
      ])

      this.log.info(output)
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
                this.resourceDeleted(finalizerEvent.object as PreviewVersionResource)
              ))
            ) {
              await this.resourceModified(event.object as PreviewVersionResource)
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
