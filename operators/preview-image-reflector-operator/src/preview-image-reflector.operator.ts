import Operator                             from '@dot-i/k8s-operator'
import { ResourceEventType }                from '@dot-i/k8s-operator'
import { CustomObjectsApi }                 from '@kubernetes/client-node'
import parseDockerImage                     from 'parse-docker-image-name'

import { kind2Plural }                      from '@monstrs/k8s-resource-utils'
import { PreviewAutomationResourceVersion } from '@monstrs/k8s-preview-automation-operator'
import { PreviewVersionResourceVersion }    from '@monstrs/k8s-preview-automation-operator'
import { PreviewVersionResourceGroup }      from '@monstrs/k8s-preview-automation-operator'
import { PreviewAutomationResourceGroup }   from '@monstrs/k8s-preview-automation-operator'
import { PreviewVersionResource }           from '@monstrs/k8s-preview-automation-operator'
import { PreviewAutomationResource }        from '@monstrs/k8s-preview-automation-operator'
import { Logger }                           from '@monstrs/k8s-operator-logger'

import { PreviewAutomationsRegistry }       from './preview-automations.registry'
import { ImagePolicyResource }              from './image-policy.interfaces'

export class PreviewImageReflectorOperator extends Operator {
  public static DOMAIN_GROUP = 'preview.monstrs.tech'

  private readonly log = new Logger(PreviewImageReflectorOperator.name)

  private readonly k8sCustomObjectsApi: CustomObjectsApi

  private readonly automationRegistry = new PreviewAutomationsRegistry()

  constructor() {
    super(new Logger(PreviewImageReflectorOperator.name))

    this.k8sCustomObjectsApi = this.kubeConfig.makeApiClient(CustomObjectsApi)
  }

  private async getPreviewVersion(
    namespace: string,
    name: string
  ): Promise<PreviewVersionResource | null> {
    try {
      const { body } = await this.k8sCustomObjectsApi.getNamespacedCustomObject(
        PreviewImageReflectorOperator.DOMAIN_GROUP,
        PreviewVersionResourceVersion.v1alpha1,
        namespace,
        kind2Plural(PreviewVersionResourceGroup.PreviewVersion),
        name
      )

      return body as PreviewVersionResource
    } catch {
      return null
    }
  }

  private async patchPreviewVersion(namespace: string, name: string, spec) {
    return this.k8sCustomObjectsApi.patchNamespacedCustomObject(
      PreviewImageReflectorOperator.DOMAIN_GROUP,
      PreviewVersionResourceVersion.v1alpha1,
      namespace,
      kind2Plural(PreviewVersionResourceGroup.PreviewVersion),
      name,
      [
        {
          op: 'replace',
          path: '/spec',
          value: spec,
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

  private async createPreviewVersion(namespace: string, name: string, spec) {
    return this.k8sCustomObjectsApi.createNamespacedCustomObject(
      PreviewImageReflectorOperator.DOMAIN_GROUP,
      PreviewVersionResourceVersion.v1alpha1,
      namespace,
      kind2Plural(PreviewVersionResourceGroup.PreviewVersion),
      {
        apiVersion: 'preview.monstrs.tech/v1alpha1',
        kind: 'PreviewVersion',
        metadata: {
          name,
        },
        spec,
      }
    )
  }

  private async resourceModified(event) {
    const resource = event.object as ImagePolicyResource

    const automation = this.automationRegistry.getByImagePolicy(resource)

    if (automation) {
      const { filterTags } = resource.spec

      if (filterTags.pattern === '^[a-f0-9]+-[a-f0-9]+-(?P<ts>[0-9]+)') {
        const { latestImage } = resource.status

        if (latestImage) {
          const { tag } = parseDockerImage(latestImage)

          if (tag) {
            const [scopeId] = tag.split('-')
            const name = `${automation.metadata!.name}-${scopeId}`

            const spec = {
              previewAutomationRef: {
                name: automation.metadata!.name,
              },
              tag,
              scope: {
                id: scopeId,
              },
            }

            if (await this.getPreviewVersion(automation.metadata!.namespace!, name)) {
              await this.patchPreviewVersion(automation.metadata!.namespace!, name, spec)
            } else {
              await this.createPreviewVersion(automation.metadata!.namespace!, name, spec)
            }
          }
        }
      }
    }
  }

  protected async init() {
    await this.watchResource(
      PreviewImageReflectorOperator.DOMAIN_GROUP,
      PreviewAutomationResourceVersion.v1alpha1,
      kind2Plural(PreviewAutomationResourceGroup.PreviewAutomation),
      async (event) => {
        if (event.type === ResourceEventType.Added || event.type === ResourceEventType.Modified) {
          this.automationRegistry.add(event.object as PreviewAutomationResource)
        } else if (event.type === ResourceEventType.Deleted) {
          this.automationRegistry.delete(event.object as PreviewAutomationResource)
        }
      }
    )

    await this.watchResource(
      'image.toolkit.fluxcd.io',
      'v1alpha1',
      'imagepolicies',
      async (event) => {
        if (event.type === ResourceEventType.Modified) {
          this.resourceModified(event)
        }
      }
    )
  }
}
