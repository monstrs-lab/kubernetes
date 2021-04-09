import { PreviewImageReflectorOperator } from '@monstrs/k8s-preview-image-reflector-operator'
import { PreviewNotificationOperator }   from '@monstrs/k8s-preview-notification-operator'
import { PreviewAutomationOperator }     from '@monstrs/k8s-preview-automation-operator'
import { PreviewIngressOperator }        from '@monstrs/k8s-preview-ingress-operator'

const bootstrap = async () => {
  const automationOperator = new PreviewAutomationOperator()
  const imageReflectorOperator = new PreviewImageReflectorOperator()
  const ingressOperator = new PreviewIngressOperator()
  const notificationOperator = new PreviewNotificationOperator({
    type: 'github',
    token: process.env.GITHUB_TOKEN!,
  })

  await Promise.all([
    automationOperator.start(),
    imageReflectorOperator.start(),
    ingressOperator.start(),
    notificationOperator.start(),
  ])

  const exit = (reason: string) => {
    console.log(reason) // eslint-disable-line no-console

    imageReflectorOperator.stop()
    automationOperator.stop()
    ingressOperator.stop()
    notificationOperator.stop()

    process.exit(0)
  }

  process.on('SIGTERM', () => exit('SIGTERM')).on('SIGINT', () => exit('SIGINT'))
}

// eslint-disable-next-line no-console
bootstrap().catch(console.error)
