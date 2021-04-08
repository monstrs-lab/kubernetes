import Operator                          from '@dot-i/k8s-operator'
import { ResourceEventType }             from '@dot-i/k8s-operator'
import { CustomObjectsApi }              from '@kubernetes/client-node'

import { Logger }                        from '@monstrs/k8s-operator-logger'

import { IstioIngressGenerator }         from './istio-ingress.generator'
import { CertManagerTlsGenerator }       from './cert-manager-tls.generator'
import { IngressGenerator }              from './ingress-generator.interfaces'
import { TlsGenerator }                  from './tls-generator.interfaces'
import { PreviewIngressOperatorOptions } from './preview-ingress.interfaces'

export class PreviewIngressOperator extends Operator {
  public static DOMAIN_GROUP = 'preview.monstrs.tech'

  private readonly log = new Logger(PreviewIngressOperator.name)

  private readonly ingressGenerator: IngressGenerator

  private readonly tlsGenerator: TlsGenerator

  constructor(private readonly options: PreviewIngressOperatorOptions) {
    super(new Logger(PreviewIngressOperator.name))

    this.ingressGenerator = new IstioIngressGenerator(
      this.kubeConfig.makeApiClient(CustomObjectsApi)
    )

    this.tlsGenerator = new CertManagerTlsGenerator(this.kubeConfig.makeApiClient(CustomObjectsApi))
  }

  protected async init() {
    await this.watchResource('', 'v1', 'services', async (event) => {
      if (event.object.metadata?.annotations?.['preview.monstrs.tech/automated']) {
        const namespace = event.object.metadata.namespace || 'default'
        const name = event.object.metadata.name!

        try {
          if (event.type === ResourceEventType.Added || event.type === ResourceEventType.Modified) {
            const [port] = (event.object as any).spec.ports

            if (port) {
              const host = `${name}.${this.options.endpoint}`

              await this.tlsGenerator.apply('istio-system', name, host)
              await this.ingressGenerator.apply(namespace, name, host, port.port, true)
            }
          } else if (event.type === ResourceEventType.Deleted) {
            await this.ingressGenerator.delete(namespace, name)
            await this.tlsGenerator.delete('istio-system', name)
          }
        } catch (error) {
          this.log.error(error)
        }
      }
    })
  }
}
