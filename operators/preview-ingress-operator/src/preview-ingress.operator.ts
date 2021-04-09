import Operator                             from '@dot-i/k8s-operator'
import { ResourceEventType }                from '@dot-i/k8s-operator'
import { CustomObjectsApi }                 from '@kubernetes/client-node'
import { Logger }                           from '@monstrs/logger'

import { kind2Plural }                      from '@monstrs/k8s-resource-utils'
import { OperatorLogger }                   from '@monstrs/k8s-operator-logger'
import { PreviewAutomationResource }        from '@monstrs/k8s-preview-automation-operator'
import { PreviewAutomationResourceVersion } from '@monstrs/k8s-preview-automation-operator'
import { PreviewAutomationResourceGroup }   from '@monstrs/k8s-preview-automation-operator'

import { IstioIngressGenerator }            from './istio-ingress.generator'
import { CertManagerTlsGenerator }          from './cert-manager-tls.generator'
import { IngressGenerator }                 from './ingress-generator.interfaces'
import { TlsGenerator }                     from './tls-generator.interfaces'

export class PreviewIngressOperator extends Operator {
  public static DOMAIN_GROUP = 'preview.monstrs.tech'

  private readonly log = new Logger(PreviewIngressOperator.name)

  private readonly k8sCustomObjectsApi: CustomObjectsApi

  private readonly ingressGenerator: IngressGenerator

  private readonly tlsGenerator: TlsGenerator

  constructor() {
    super(new OperatorLogger(PreviewIngressOperator.name))

    this.k8sCustomObjectsApi = this.kubeConfig.makeApiClient(CustomObjectsApi)
    this.ingressGenerator = new IstioIngressGenerator(this.k8sCustomObjectsApi)
    this.tlsGenerator = new CertManagerTlsGenerator(this.k8sCustomObjectsApi)
  }

  private async getPreviewAutomation(
    namespace: string,
    name: string
  ): Promise<PreviewAutomationResource> {
    const { body } = await this.k8sCustomObjectsApi.getNamespacedCustomObject(
      PreviewIngressOperator.DOMAIN_GROUP,
      PreviewAutomationResourceVersion.v1alpha1,
      namespace,
      kind2Plural(PreviewAutomationResourceGroup.PreviewAutomation),
      name
    )

    return body as PreviewAutomationResource
  }

  protected async init() {
    await this.watchResource('', 'v1', 'services', async (event) => {
      const namespace = event.object.metadata?.namespace || 'default'
      const name = event.object.metadata?.name!

      const automationName = event.object.metadata?.annotations?.['preview.monstrs.tech/automation']

      if (automationName) {
        try {
          if (event.type === ResourceEventType.Added || event.type === ResourceEventType.Modified) {
            const automation = await this.getPreviewAutomation(namespace, automationName)

            const [port] = (event.object as any).spec.ports

            if (port) {
              const host = `${name}.${automation.spec.endpoint.domain}`

              await this.tlsGenerator.apply('istio-system', name, host)
              await this.ingressGenerator.apply(namespace, name, host, port.port, true)
            }
          } else if (event.type === ResourceEventType.Deleted) {
            await this.ingressGenerator.delete(namespace, name)
            await this.tlsGenerator.delete('istio-system', name)
          }
        } catch (error) {
          this.log.error(error.body || error)
        }
      }
    })
  }
}
