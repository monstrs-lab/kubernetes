import { KubeConfig }                            from '@kubernetes/client-node'
import { HttpError }                             from '@kubernetes/client-node'
import { Octokit }                               from '@octokit/rest'

import { GitRepositoryResource }                 from '@monstrs/k8s-flux-toolkit-api'
import { SourceApi }                             from '@monstrs/k8s-flux-toolkit-api'
import { Operator }                              from '@monstrs/k8s-operator'
import { ResourceEventType }                     from '@monstrs/k8s-operator'
import { PreviewVersionResourceVersion }         from '@monstrs/k8s-preview-automation-api'
import { PreviewVersionResourceGroup }           from '@monstrs/k8s-preview-automation-api'
import { PreviewVersionResource }                from '@monstrs/k8s-preview-automation-api'
import { PreviewAutomationResource }             from '@monstrs/k8s-preview-automation-api'
import { PreviewVersionApi }                     from '@monstrs/k8s-preview-automation-api'
import { PreviewAutomationApi }                  from '@monstrs/k8s-preview-automation-api'
import { PreviewAutomationDomain }               from '@monstrs/k8s-preview-automation-api'
import { kind2Plural }                           from '@monstrs/k8s-resource-utils'

import { PreviewPullRequestSyncOperatorOptions } from './preview-pull-request-sync.interfaces'

export interface Task {
  version: PreviewVersionResource
  automation: PreviewAutomationResource
  source: GitRepositoryResource
}

export class PreviewPullRequestSyncOperator extends Operator {
  private readonly previewAutomationApi: PreviewAutomationApi

  private readonly previewVersionApi: PreviewVersionApi

  private readonly sourceApi: SourceApi

  private readonly octokit: Octokit

  private readonly tasks = new Map<string, Task>()

  private schedule

  constructor(
    private readonly options: PreviewPullRequestSyncOperatorOptions,
    kubeConfig?: KubeConfig
  ) {
    super(kubeConfig)

    if (!options.token) {
      throw new Error('GitHub token config required')
    }

    this.octokit = new Octokit({
      auth: options.token,
    })

    this.previewAutomationApi = new PreviewAutomationApi(this.kubeConfig)
    this.previewVersionApi = new PreviewVersionApi(this.kubeConfig)
    this.sourceApi = new SourceApi(this.kubeConfig)
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
            await this.previewVersionApi.deletePreviewVersion(
              task.version.metadata!.name!,
              task.version.metadata?.namespace
            )
          }
        })
      )
    } catch (error) {
      this.logger.error((error as HttpError).body || error)
    }
  }

  private async resourceModified(previewVersion: PreviewVersionResource) {
    const key = `${previewVersion.metadata?.namespace || 'default'}.${
      previewVersion.metadata!.name
    }`

    if (!this.tasks.has(key)) {
      const automation = await this.previewAutomationApi.getPreviewAutomation(
        previewVersion.spec.previewAutomationRef.name,
        previewVersion.spec.previewAutomationRef.namespace || previewVersion.metadata?.namespace
      )

      const source = await this.sourceApi.getGitRepository(
        automation.spec.sourceRef.name,
        automation.spec.sourceRef.namespace || automation.metadata?.namespace
      )

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
    this.schedule = setInterval(async () => {
      try {
        await this.checkPreviewResources()
      } catch (error) {
        this.logger.error((error as HttpError).body)
      }
    }, this.options.schedule?.interval || 1000 * 60)

    await this.watchResource(
      PreviewAutomationDomain.Group,
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
          this.logger.error((error as HttpError).body)
        }
      }
    )
  }

  public stop(): void {
    super.stop()

    if (this.schedule) {
      clearInterval(this.schedule)
    }
  }
}
