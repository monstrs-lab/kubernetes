import { KubeConfig }                    from '@kubernetes/client-node'
import { HttpError }                     from '@kubernetes/client-node'
import { KubernetesObjectApi }           from '@kubernetes/client-node'

import { ImageRepositoryApi }            from '@monstrs/k8s-flux-toolkit-api'
import { SourceApi }                     from '@monstrs/k8s-flux-toolkit-api'
import { GatewayApi }                    from '@monstrs/k8s-istio-api'
import { Operator }                      from '@monstrs/k8s-operator'
import { ResourceEventType }             from '@monstrs/k8s-operator'
import { PreviewAutomationApi }          from '@monstrs/k8s-preview-automation-api'
import { PreviewVersionApi }             from '@monstrs/k8s-preview-automation-api'
import { PreviewAutomationDomain }       from '@monstrs/k8s-preview-automation-api'
import { PreviewVersionResourceVersion } from '@monstrs/k8s-preview-automation-api'
import { PreviewVersionResourceGroup }   from '@monstrs/k8s-preview-automation-api'
import { PreviewVersionStatusPhase }     from '@monstrs/k8s-preview-automation-api'
import { PreviewVersionResource }        from '@monstrs/k8s-preview-automation-api'
import { PreviewAutomationAnnotation }   from '@monstrs/k8s-preview-automation-api'
import { kustomize }                     from '@monstrs/k8s-kustomize'
import { objectUtils }                   from '@monstrs/k8s-object-utils'
import { kind2Plural }                   from '@monstrs/k8s-resource-utils'

export class PreviewAutomationOperator extends Operator {
  private readonly previewAutomationApi: PreviewAutomationApi

  private readonly previewVersionApi: PreviewVersionApi

  private readonly imageRepositoryApi: ImageRepositoryApi

  private readonly gatewayApi: GatewayApi

  private readonly sourceApi: SourceApi

  private readonly objectApi: KubernetesObjectApi

  constructor(kubeConfig?: KubeConfig) {
    super(kubeConfig)

    this.objectApi = KubernetesObjectApi.makeApiClient(this.kubeConfig)
    this.previewAutomationApi = new PreviewAutomationApi(this.kubeConfig)
    this.previewVersionApi = new PreviewVersionApi(this.kubeConfig)
    this.imageRepositoryApi = new ImageRepositoryApi(this.kubeConfig)
    this.gatewayApi = new GatewayApi(this.kubeConfig)
    this.sourceApi = new SourceApi(this.kubeConfig)
  }

  async buildPreview(previewVersion: PreviewVersionResource) {
    const automation = await this.previewAutomationApi.getPreviewAutomation(
      previewVersion.spec.previewAutomationRef.name,
      previewVersion.spec.previewAutomationRef.namespace || previewVersion.metadata?.namespace
    )

    const gateway = automation.spec.gatewayRef
      ? await this.gatewayApi.getGateway(
          automation.spec.gatewayRef.name,
          automation.spec.gatewayRef.namespace || automation.metadata?.namespace
        )
      : null

    const imageRepository = await this.imageRepositoryApi.getImageRepository(
      automation.spec.imageRepositoryRef.name,
      automation.spec.imageRepositoryRef.namespace || automation.metadata?.namespace
    )

    const source = await this.sourceApi.getGitRepository(
      automation.spec.sourceRef.name,
      automation.spec.sourceRef.namespace || automation.metadata?.namespace
    )

    const resources = await this.previewAutomationApi.getPreviewAutomationResources(automation)

    const annotation: PreviewAutomationAnnotation = {
      name: automation.metadata!.name!,
      endpoint: gateway
        ? {
            name: gateway.metadata!.name!,
            namespace: gateway.metadata?.namespace || 'default',
            hosts: gateway.spec.servers
              .map((server) => server.hosts)
              .flat()
              .filter((host) => host.startsWith('*.'))
              .map((host) =>
                host.replace(
                  '*.',
                  `${automation.metadata!.name}-${previewVersion.spec.context.number}.`
                )),
          }
        : undefined,
      context: previewVersion.spec.context,
      source: {
        kind: source.kind!,
        url: source.spec.url,
      },
    }

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
        'preview.monstrs.tech/automation': JSON.stringify(annotation),
      },
    }

    return kustomize.build(resources, transformations)
  }

  updatePreviewVersionStatus(resource, phase: PreviewVersionStatusPhase, message: string) {
    return this.previewVersionApi.updatePreviewVersionStatus(
      resource.metadata!.name!,
      {
        observedGeneration: resource.metadata?.generation,
        ready: phase === PreviewVersionStatusPhase.Succeeded,
        message,
        phase,
      },
      resource.metadata?.namespace
    )
  }

  protected async init() {
    await this.watchResource(
      PreviewAutomationDomain.Group,
      PreviewVersionResourceVersion.v1alpha1,
      kind2Plural(PreviewVersionResourceGroup.PreviewVersion),
      async (event) => {
        const resource = event.object as PreviewVersionResource
        const logger = this.logger.child(resource.metadata!.name!)

        try {
          logger.info(`Handle '${event.type}' event type`)

          if (event.type === ResourceEventType.Added || event.type === ResourceEventType.Modified) {
            const finalizer = `${kind2Plural(PreviewVersionResourceGroup.PreviewVersion)}.${
              PreviewAutomationDomain.Group
            }`

            logger.info(`Check resource '${finalizer}' finalization`)

            const resourceFinalized = await this.handleResourceFinalizer(event, finalizer, async (
              finalizerEvent
            ) => {
              for await (const spec of await this.buildPreview(
                finalizerEvent.object as PreviewVersionResource
              )) {
                await this.objectApi.delete(spec)
              }
            })

            logger.info(
              `Resource '${finalizer}' ${resourceFinalized ? 'not ' : ' '}require finalization`
            )

            if (!resourceFinalized) {
              const { status, metadata } = event.object as PreviewVersionResource

              if (!status || status.observedGeneration !== metadata?.generation) {
                await this.updatePreviewVersionStatus(
                  resource,
                  PreviewVersionStatusPhase.Pending,
                  'Updating preview version'
                )

                logger.info('Update preview version status updated to pending')

                for await (const spec of await this.buildPreview(resource)) {
                  await objectUtils.apply(this.objectApi, spec)
                }

                logger.info('Preview version resources applied')

                await this.updatePreviewVersionStatus(
                  resource,
                  PreviewVersionStatusPhase.Succeeded,
                  'Preview version updated'
                )

                logger.info('Update preview version status updated to succeeded')
              }
            }
          }
        } catch (error) {
          logger.error((error as HttpError).body || error)

          await this.updatePreviewVersionStatus(
            resource,
            PreviewVersionStatusPhase.Failed,
            (error as HttpError).body.message?.toString() || (error as any).message
          )
        }
      }
    )
  }
}
