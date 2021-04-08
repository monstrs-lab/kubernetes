import { PreviewImageReflectorOperator } from '@monstrs/k8s-preview-image-reflector-operator'
import { PreviewAutomationOperator }     from '@monstrs/k8s-preview-automation-operator'
import { PreviewIngressOperator }        from '@monstrs/k8s-preview-ingress-operator'

const bootstrap = async () => {
  const previewImageReflectorOperator = new PreviewImageReflectorOperator()
  const previewAutomationOperator = new PreviewAutomationOperator()
  const previewIngressOperator = new PreviewIngressOperator({
    endpoint: process.env.PREVIEW_INGRESS_ENDPOINT || 'localhost:8080',
  })

  await Promise.all([
    previewImageReflectorOperator.start(),
    previewAutomationOperator.start(),
    previewIngressOperator.start(),
  ])

  const exit = (reason: string) => {
    console.log(reason) // eslint-disable-line no-console

    previewImageReflectorOperator.stop()
    previewAutomationOperator.stop()
    previewIngressOperator.stop()

    process.exit(0)
  }

  process.on('SIGTERM', () => exit('SIGTERM')).on('SIGINT', () => exit('SIGINT'))
}

// eslint-disable-next-line no-console
bootstrap().catch(console.error)
