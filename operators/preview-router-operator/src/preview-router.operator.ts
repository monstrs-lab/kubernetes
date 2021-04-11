import Operator                           from '@dot-i/k8s-operator'
import { ResourceEventType }              from '@dot-i/k8s-operator'
import { Logger }                         from '@monstrs/logger'
import deepEqual                          from 'deep-equal'

import { PreviewAutomationDomain }        from '@monstrs/k8s-preview-automation-api'
import { PreviewEndpointResourceVersion } from '@monstrs/k8s-preview-automation-api'
import { PreviewEndpointResourceGroup }   from '@monstrs/k8s-preview-automation-api'
import { PreviewEndpointResource }        from '@monstrs/k8s-preview-automation-api'
import { GatewayApi }                     from '@monstrs/k8s-istio-api'
import { VirtualServiceApi }              from '@monstrs/k8s-istio-api'
import { CertificateApi }                 from '@monstrs/k8s-cert-manager-api'
import { kind2Plural }                    from '@monstrs/k8s-resource-utils'
import { OperatorLogger }                 from '@monstrs/k8s-operator-logger'

import { EndpointRegistry }               from './endpoint.registry'

export class PreviewRouterOperator extends Operator {
  private readonly log = new Logger(PreviewRouterOperator.name)

  private readonly endpointRegistry: EndpointRegistry

  private readonly virtualServiceApi: VirtualServiceApi

  private readonly gatewayApi: GatewayApi

  private readonly certificateApi: CertificateApi

  constructor() {
    super(new OperatorLogger(PreviewRouterOperator.name))

    this.virtualServiceApi = new VirtualServiceApi(this.kubeConfig)
    this.gatewayApi = new GatewayApi(this.kubeConfig)
    this.certificateApi = new CertificateApi(this.kubeConfig)
    this.endpointRegistry = new EndpointRegistry(this.certificateApi, this.gatewayApi)
  }

  private parseAnnotations(annotation?: string) {
    try {
      return annotation ? JSON.parse(annotation) : null
    } catch {
      return null
    }
  }

  private async resourceModified(resource) {
    const automation = this.parseAnnotations(
      resource.metadata?.annotations?.['preview.monstrs.tech/automation']
    )

    if (!automation.endpoint) {
      return
    }

    const endpoint = await this.endpointRegistry.getEndpoint(automation.endpoint.name)

    if (!endpoint?.gateway) {
      return
    }

    const name = `preview-${resource.metadata!.namespace || 'default'}-${resource.metadata!.name!}`
    const port = resource.spec.ports.find((item) => item.name === 'http') || resource.spec.ports[0]

    const spec = {
      hosts: [`${automation.name}-${automation.context.number}.${automation.endpoint.url}`],
      gateways: [endpoint.gateway],
      http: [
        {
          route: [
            {
              destination: {
                host: `${resource.metadata.name}.${resource.metadata.namespace}.svc.cluster.local`,
                port: {
                  number: port.port,
                },
              },
            },
          ],
        },
      ],
    }

    try {
      const virtualService = await this.virtualServiceApi.getVirtualService(
        automation.metadata!.namespace!,
        name
      )

      if (!deepEqual(virtualService.spec, spec)) {
        await this.virtualServiceApi.patchVirtualService(automation.metadata!.namespace!, name, [
          {
            op: 'replace',
            path: '/spec',
            value: spec,
          },
        ])
      }
    } catch (error) {
      if (error.body?.code === 404) {
        await this.virtualServiceApi.createVirtualService('istio-system', name, spec)
      } else {
        throw error
      }
    }
  }

  private async resourceDeleted(resource) {
    await this.virtualServiceApi.deleteVirtualService(
      'istio-system',
      `preview-${resource.metadata!.namespace || 'default'}-${resource.metadata!.name!}`
    )
  }

  protected async init() {
    await this.watchResource('', 'v1', 'services', async (event) => {
      if (event.object.metadata?.annotations?.['preview.monstrs.tech/automation']) {
        try {
          if (event.type === ResourceEventType.Added || event.type === ResourceEventType.Modified) {
            await this.resourceModified(event.object)
          } else if (event.type === ResourceEventType.Deleted) {
            await this.resourceDeleted(event.object)
          }
        } catch (error) {
          this.log.error(error.body || error)
        }
      }
    })

    await this.watchResource(
      PreviewAutomationDomain.Group,
      PreviewEndpointResourceVersion.v1alpha1,
      kind2Plural(PreviewEndpointResourceGroup.PreviewEndpoint),
      async (event) => {
        try {
          if (event.type === ResourceEventType.Added || event.type === ResourceEventType.Modified) {
            await this.endpointRegistry.addEndpoint(event.object as PreviewEndpointResource)
          } else if (event.type === ResourceEventType.Deleted) {
            await this.endpointRegistry.deleteEndpoint(event.object as PreviewEndpointResource)
          }
        } catch (error) {
          this.log.error(error.body || error)
        }
      }
    )
  }
}
