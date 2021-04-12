import { PreviewImageReflectorOperator }  from '@monstrs/k8s-preview-image-reflector-operator'
import { PreviewNotificationOperator }    from '@monstrs/k8s-preview-notification-operator'
import { PreviewAutomationOperator }      from '@monstrs/k8s-preview-automation-operator'
import { PreviewRouterOperator }          from '@monstrs/k8s-preview-router-operator'
import { PreviewPullRequestSyncOperator } from '@monstrs/k8s-preview-pull-request-sync-operator'

const bootstrap = async () => {
  const automationOperator = new PreviewAutomationOperator()
  const imageReflectorOperator = new PreviewImageReflectorOperator()
  const routerOperator = new PreviewRouterOperator()
  const notificationOperator = new PreviewNotificationOperator({
    token: process.env.GITHUB_TOKEN!,
  })
  const pullRequestSyncOperator = new PreviewPullRequestSyncOperator({
    provider: 'github',
    token: process.env.GITHUB_TOKEN!,
  })

  await Promise.all([
    automationOperator.start(),
    imageReflectorOperator.start(),
    routerOperator.start(),
    notificationOperator.start(),
    pullRequestSyncOperator.start(),
  ])

  const exit = (reason: string) => {
    console.log(reason) // eslint-disable-line no-console

    imageReflectorOperator.stop()
    automationOperator.stop()
    routerOperator.stop()
    notificationOperator.stop()
    pullRequestSyncOperator.stop()

    process.exit(0)
  }

  process.on('SIGTERM', () => exit('SIGTERM')).on('SIGINT', () => exit('SIGINT'))
}

// eslint-disable-next-line no-console
bootstrap().catch(console.error)
