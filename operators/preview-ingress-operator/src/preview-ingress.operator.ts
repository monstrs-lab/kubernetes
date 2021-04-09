import Operator                    from '@dot-i/k8s-operator'
import { ResourceEventType }       from '@dot-i/k8s-operator'
import { CustomObjectsApi }        from '@kubernetes/client-node'
import { Logger }                  from '@monstrs/logger'

import { OperatorLogger }          from '@monstrs/k8s-operator-logger'

import { IstioIngressGenerator }   from './istio-ingress.generator'
import { CertManagerTlsGenerator } from './cert-manager-tls.generator'
import { IngressGenerator }        from './ingress-generator.interfaces'
import { TlsGenerator }            from './tls-generator.interfaces'

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

  protected async init() {
    await this.watchResource('', 'v1', 'services', async (event) => {
      const namespace = event.object.metadata?.namespace || 'default'
      const name = event.object.metadata?.name!

      const host = event.object.metadata?.annotations?.['preview.monstrs.tech/host']

      if (host) {
        try {
          if (event.type === ResourceEventType.Added || event.type === ResourceEventType.Modified) {
            const [port] = (event.object as any).spec.ports

            if (port) {
              await this.tlsGenerator.apply('istio-system', name, host)
              await this.ingressGenerator.apply(namespace, name, host, port.port, true)
            }
          } else if (event.type === ResourceEventType.Deleted) {
            await this.ingressGenerator.delete(namespace, name)
          }
        } catch (error) {
          this.log.error(error.body || error)
        }
      }
    })
  }
}
