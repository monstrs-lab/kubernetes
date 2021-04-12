import Operator                               from '@dot-i/k8s-operator'
import { ResourceEventType }                  from '@dot-i/k8s-operator'
import { Logger }                             from '@monstrs/logger'

import { OperatorLogger }                     from '@monstrs/k8s-operator-logger'
import { PreviewAutomationAnnotation }        from '@monstrs/k8s-preview-automation-api'

import { NotificationResourceTracker }        from './notification-resource.tracker'
import { PreviewNotificationOperatorOptions } from './preview-notification.interfaces'
import { GitHubNotificationProvider }         from './github-notification.provider'
import { NotificationProvider }               from './notification-provider.intefaces'
import { MessageFormatter }                   from './message.formatter'

export class PreviewNotificationOperator extends Operator {
  public static DOMAIN_GROUP = 'preview.monstrs.tech'

  private readonly log = new Logger(PreviewNotificationOperator.name)

  private readonly resourceTracker = new NotificationResourceTracker()

  private readonly messageFormatter = new MessageFormatter()

  private readonly provider: NotificationProvider

  constructor(options: PreviewNotificationOperatorOptions) {
    super(new OperatorLogger(PreviewNotificationOperator.name))

    if (!options.token) {
      throw new Error('GitHub token config required')
    }

    this.provider = new GitHubNotificationProvider(options.token)
  }

  private parseAnnotations(annotation?: string): null | PreviewAutomationAnnotation {
    try {
      return annotation ? JSON.parse(annotation) : null
    } catch {
      return null
    }
  }

  private getResourceAutomation(resource): null | PreviewAutomationAnnotation {
    const automation = this.parseAnnotations(
      resource.metadata?.annotations?.['preview.monstrs.tech/automation']
    )

    if (!automation) {
      return null
    }

    if (this.resourceTracker.has(resource)) {
      return null
    }

    if (
      !(
        automation.source &&
        automation.source.url &&
        automation.source.kind === 'GitRepository' &&
        automation.source.url?.includes('github.com')
      )
    ) {
      return null
    }

    if (
      !(
        automation.context &&
        automation.context.number &&
        automation.context.kind === 'GitHubPullRequest'
      )
    ) {
      return null
    }

    return automation
  }

  protected async init() {
    await this.watchResource('apps', 'v1', 'deployments', async (event) => {
      const automation = this.getResourceAutomation(event.object)

      try {
        if (automation && automation.endpoint?.hosts) {
          const message =
            event.type === ResourceEventType.Added || event.type === ResourceEventType.Modified
              ? this.messageFormatter.formatPullRequestDeployed(
                  automation.name,
                  automation.endpoint.hosts
                )
              : this.messageFormatter.formatPullRequestUndeployed(
                  automation.name,
                  automation.endpoint.hosts
                )

          await this.provider.notify(automation.source, automation.context, message)

          this.resourceTracker.add(event.object)
        }
      } catch (error) {
        this.log.error(error)
      }
    })
  }
}
