import { PreviewImageReflectorOperator } from '@monstrs/k8s-preview-image-reflector-operator'
import { PreviewAutomationOperator }     from '@monstrs/k8s-preview-automation-operator'

const bootstrap = async () => {
  const previewImageReflectorOperator = new PreviewImageReflectorOperator()
  const previewAutomationOperator = new PreviewAutomationOperator()

  await Promise.all([previewImageReflectorOperator.start(), previewAutomationOperator.start()])

  const exit = (reason: string) => {
    console.log(reason) // eslint-disable-line no-console

    previewImageReflectorOperator.stop()
    previewAutomationOperator.stop()

    process.exit(0)
  }

  process.on('SIGTERM', () => exit('SIGTERM')).on('SIGINT', () => exit('SIGINT'))
}

// eslint-disable-next-line no-console
bootstrap().catch(console.error)
