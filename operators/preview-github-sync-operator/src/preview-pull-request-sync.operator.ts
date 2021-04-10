import Operator                                  from '@dot-i/k8s-operator'
import { ResourceEventType }                     from '@dot-i/k8s-operator'
import { CustomObjectsApi }                      from '@kubernetes/client-node'
import { Logger }                                from '@monstrs/logger'
import { Octokit }                               from '@octokit/rest'

import { kind2Plural }                           from '@monstrs/k8s-resource-utils'
import { OperatorLogger }                        from '@monstrs/k8s-operator-logger'
import { PreviewAutomationResourceGroup }        from '@monstrs/k8s-preview-automation-operator'
import { PreviewAutomationResourceVersion }      from '@monstrs/k8s-preview-automation-operator'
import { PreviewVersionResourceVersion }         from '@monstrs/k8s-preview-automation-operator'
import { PreviewVersionResourceGroup }           from '@monstrs/k8s-preview-automation-operator'
import { PreviewVersionResource }                from '@monstrs/k8s-preview-automation-operator'
import { PreviewAutomationResource }             from '@monstrs/k8s-preview-automation-operator'
import { GitRepositoryResource }                 from '@monstrs/k8s-preview-automation-operator'

import { PreviewPullRequestSyncOperatorOptions } from './preview-pull-request-sync.interfaces'

export interface Task {
  version: PreviewVersionResource
  automation: PreviewAutomationResource
  source: GitRepositoryResource
}

export class PreviewPullRequestSyncOperator extends Operator {
  public static DOMAIN_GROUP = 'preview.monstrs.tech'

  private readonly log = new Logger(PreviewPullRequestSyncOperator.name)

  private readonly k8sCustomObjectsApi: CustomObjectsApi

  private readonly octokit: Octokit

  private readonly tasks = new Map<string, Task>()

  private schedule

  constructor(options: PreviewPullRequestSyncOperatorOptions) {
    super(new OperatorLogger(PreviewPullRequestSyncOperator.name))

    if (!options.token) {
      throw new Error('GitHub token config required')
    }

    this.octokit = new Octokit({
      auth: options.token,
    })

    this.k8sCustomObjectsApi = this.kubeConfig.makeApiClient(CustomObjectsApi)
  }

  private async deletePreviewVersion(previewVersion: PreviewVersionResource) {
    return this.k8sCustomObjectsApi.deleteNamespacedCustomObject(
      PreviewPullRequestSyncOperator.DOMAIN_GROUP,
      PreviewVersionResourceVersion.v1alpha1,
      previewVersion.metadata?.namespace || 'default',
      kind2Plural(PreviewVersionResourceGroup.PreviewVersion),
      previewVersion.metadata!.name!
    )
  }

  private async checkPreviewResources() {
    // TODO: queue

    try {
      await Promise.all(
        Array.from(this.tasks.values()).map(async (task) => {
          const { pathname } = new URL(task.source.spec.url)
          const [, owner, repo] = pathname.split('/')

          const { data } = await this.octokit.pulls.get({
            pull_number: Number(task.version.spec.context.number),
            owner,
            repo,
          })

          if (data.state === 'closed') {
            await this.deletePreviewVersion(task.version)
          }
        })
      )
    } catch (error) {
      this.log.error(error)
    }
  }

  private async getPreviewAutomation(
    previewVersion: PreviewVersionResource
  ): Promise<PreviewAutomationResource> {
    const { body } = await this.k8sCustomObjectsApi.getNamespacedCustomObject(
      PreviewPullRequestSyncOperator.DOMAIN_GROUP,
      PreviewAutomationResourceVersion.v1alpha1,
      previewVersion.spec.previewAutomationRef.namespace ||
        previewVersion.metadata?.namespace ||
        'default',
      kind2Plural(PreviewAutomationResourceGroup.PreviewAutomation),
      previewVersion.spec.previewAutomationRef.name
    )

    return body as PreviewAutomationResource
  }

  private async getSource(automation: PreviewAutomationResource): Promise<GitRepositoryResource> {
    const { body } = await this.k8sCustomObjectsApi.getNamespacedCustomObject(
      'source.toolkit.fluxcd.io',
      'v1beta1',
      automation.spec.sourceRef.namespace || automation.metadata?.namespace || 'default',
      'gitrepositories',
      automation.spec.sourceRef.name
    )

    return body as GitRepositoryResource
  }

  private async resourceModified(previewVersion: PreviewVersionResource) {
    const key = `${previewVersion.metadata?.namespace || 'default'}.${
      previewVersion.metadata!.name
    }`

    if (!this.tasks.has(key)) {
      const automation = await this.getPreviewAutomation(previewVersion)
      const source = await this.getSource(automation)

      this.tasks.set(key, {
        version: previewVersion,
        automation,
        source,
      })
    }
  }

  private async resourceDeleted(previewVersion: PreviewVersionResource) {
    const key = `${previewVersion.metadata?.namespace || 'default'}.${
      previewVersion.metadata!.name
    }`

    if (this.tasks.has(key)) {
      this.tasks.delete(key)
    }
  }

  protected async init() {
    await this.watchResource(
      PreviewPullRequestSyncOperator.DOMAIN_GROUP,
      PreviewVersionResourceVersion.v1alpha1,
      kind2Plural(PreviewVersionResourceGroup.PreviewVersion),
      async (event) => {
        try {
          if (event.type === ResourceEventType.Added || event.type === ResourceEventType.Modified) {
            await this.resourceModified(event.object as PreviewVersionResource)
          } else if (event.type === ResourceEventType.Deleted) {
            await this.resourceDeleted(event.object as PreviewVersionResource)
          }
        } catch (error) {
          this.log.error(error.body || error)
        }
      }
    )

    this.schedule = setInterval(async () => {
      try {
        await this.checkPreviewResources()
      } catch (error) {
        this.log.error(error.body || error)
      }
    }, 1000 * 60)
  }

  public stop(): void {
    super.stop()

    if (this.schedule) {
      clearInterval(this.schedule)
    }
  }
}
