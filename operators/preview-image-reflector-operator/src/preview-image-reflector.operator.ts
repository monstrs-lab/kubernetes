import Operator                             from '@dot-i/k8s-operator'
import { ResourceEventType }                from '@dot-i/k8s-operator'
import parseDockerImage                     from 'parse-docker-image-name'
import { Logger }                           from '@monstrs/logger'
import deepEqual                            from 'deep-equal'

import { kind2Plural }                      from '@monstrs/k8s-resource-utils'
import { PreviewAutomationResourceVersion } from '@monstrs/k8s-preview-automation-api'
import { PreviewAutomationResourceGroup }   from '@monstrs/k8s-preview-automation-api'
import { PreviewAutomationResource }        from '@monstrs/k8s-preview-automation-api'
import { PreviewAutomationDomain }          from '@monstrs/k8s-preview-automation-api'
import { PreviewVersionApi }                from '@monstrs/k8s-preview-automation-api'
import { PreviewVersionSpec }               from '@monstrs/k8s-preview-automation-api'
import { OperatorLogger }                   from '@monstrs/k8s-operator-logger'
import { ImagePolicyResource }              from '@monstrs/k8s-flux-toolkit-api'
import { ImagePolicyDomain }                from '@monstrs/k8s-flux-toolkit-api'
import { ImagePolicyResourceVersion }       from '@monstrs/k8s-flux-toolkit-api'
import { ImagePolicyResourceGroup }         from '@monstrs/k8s-flux-toolkit-api'

import { PreviewAutomationsRegistry }       from './preview-automations.registry'

export class PreviewImageReflectorOperator extends Operator {
  private readonly log = new Logger(PreviewImageReflectorOperator.name)

  private readonly automationRegistry = new PreviewAutomationsRegistry()

  private readonly previewVersionApi: PreviewVersionApi

  constructor() {
    super(new OperatorLogger(PreviewImageReflectorOperator.name))

    this.previewVersionApi = new PreviewVersionApi(this.kubeConfig)
  }

  private parseTag(tag: string) {
    const [context, hash] = tag.split('-')

    return {
      context,
      hash,
    }
  }

  private async resourceModified(resource) {
    const automation = this.automationRegistry.getByImagePolicy(resource)

    if (!automation) {
      return
    }

    const { filterTags } = resource.spec

    if (filterTags.pattern !== '^[a-f0-9]+-[a-f0-9]+-(?P<ts>[0-9]+)') {
      return
    }

    const { latestImage } = resource.status

    if (!latestImage) {
      return
    }

    const { tag } = parseDockerImage(latestImage)
    const { context } = this.parseTag(tag)

    const name = `${automation.metadata!.name}-${context}`

    const spec: PreviewVersionSpec = {
      previewAutomationRef: {
        name: automation.metadata!.name!,
      },
      context: {
        kind: 'GitHubPullRequest',
        number: context,
      },
      tag,
    }

    try {
      const previewVersion = await this.previewVersionApi.getPreviewVersion(
        automation.metadata!.namespace!,
        name
      )

      if (!deepEqual(previewVersion.spec, spec)) {
        await this.previewVersionApi.patchPreviewVersion(automation.metadata!.namespace!, name, [
          {
            op: 'replace',
            path: '/spec',
            value: spec,
          },
        ])
      }
    } catch (error) {
      if (error.body?.code === 404) {
        await this.previewVersionApi.createPreviewVersion(
          automation.metadata!.namespace!,
          name,
          spec
        )
      } else {
        throw error
      }
    }
  }

  protected async init() {
    await this.watchResource(
      PreviewAutomationDomain.Group,
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
      ImagePolicyDomain.Group,
      ImagePolicyResourceVersion.v1alpha1,
      kind2Plural(ImagePolicyResourceGroup.ImagePolicy),
      async (event) => {
        if (event.type === ResourceEventType.Modified) {
          try {
            await this.resourceModified(event.object as ImagePolicyResource)
          } catch (error) {
            this.log.error(error.body || error)
          }
        }
      }
    )
  }
}
