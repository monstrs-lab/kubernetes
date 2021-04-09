import Operator                               from '@dot-i/k8s-operator'
import { ResourceEventType }                  from '@dot-i/k8s-operator'
import { Logger }                             from '@monstrs/logger'

import { OperatorLogger }                     from '@monstrs/k8s-operator-logger'

import { PreviewNotificationOperatorOptions } from './preview-notification.interfaces'
import { GitHubNotificationProvider }         from './github-notification.provider'
import { NotificationProvider }               from './notification-provider.intefaces'
import { MessageFormatter }                   from './message.formatter'

export class PreviewNotificationOperator extends Operator {
  public static DOMAIN_GROUP = 'preview.monstrs.tech'

  private readonly log = new Logger(PreviewNotificationOperator.name)

  private readonly provider: NotificationProvider

  private readonly messageFormatter = new MessageFormatter()

  constructor(options: PreviewNotificationOperatorOptions) {
    super(new OperatorLogger(PreviewNotificationOperator.name))

    if (!options.token) {
      throw new Error('GitHub token config required')
    }

    this.provider = new GitHubNotificationProvider(options.token)
  }

  private parseAnnotation(source: string) {
    try {
      return JSON.parse(source)
    } catch {
      return undefined
    }
  }

  protected async init() {
    await this.watchResource('apps', 'v1', 'deployments', async (event) => {
      const annotations = event.object.metadata?.annotations || {}
      const name = annotations['preview.monstrs.tech/automation']
      const host = annotations['preview.monstrs.tech/host']
      const source = annotations['preview.monstrs.tech/source']
        ? this.parseAnnotation(annotations['preview.monstrs.tech/source'])
        : undefined
      const context = annotations['preview.monstrs.tech/context']
        ? this.parseAnnotation(annotations['preview.monstrs.tech/context'])
        : undefined

      if (host && source && context) {
        if (
          source.url &&
          source.kind === 'GitRepository' &&
          context.number &&
          context.kind === 'GitHubPullRequest' &&
          source.url?.includes('github.com')
        ) {
          try {
            const message =
              event.type === ResourceEventType.Added || event.type === ResourceEventType.Modified
                ? this.messageFormatter.formatPullRequestDeployed(name, host)
                : this.messageFormatter.formatPullRequestUndeployed(name, host)

            await this.provider.notify(source, context, message)
          } catch (error) {
            this.log.error(error.body || error)
          }
        }
      }
    })
  }
}
