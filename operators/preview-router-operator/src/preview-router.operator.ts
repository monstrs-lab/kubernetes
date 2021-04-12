import Operator                        from '@dot-i/k8s-operator'
import { ResourceEventType }           from '@dot-i/k8s-operator'
import { Logger }                      from '@monstrs/logger'
import deepEqual                       from 'deep-equal'

import { PreviewAutomationAnnotation } from '@monstrs/k8s-preview-automation-api'

import { VirtualServiceApi }           from '@monstrs/k8s-istio-api'
import { OperatorLogger }              from '@monstrs/k8s-operator-logger'

export class PreviewRouterOperator extends Operator {
  private readonly log = new Logger(PreviewRouterOperator.name)

  private readonly virtualServiceApi: VirtualServiceApi

  constructor() {
    super(new OperatorLogger(PreviewRouterOperator.name))

    this.virtualServiceApi = new VirtualServiceApi(this.kubeConfig)
  }

  private parseAnnotations(annotation?: string): null | PreviewAutomationAnnotation {
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

    if (!automation?.endpoint) {
      return
    }

    const namespace = automation.endpoint.namespace || 'istio-system'
    const name = `preview-${resource.metadata!.namespace || 'default'}-${resource.metadata!.name!}`
    const port = resource.spec.ports.find((item) => item.name === 'http') || resource.spec.ports[0]

    const spec = {
      hosts: automation.endpoint.hosts,
      gateways: [automation.endpoint.name],
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
      const virtualService = await this.virtualServiceApi.getVirtualService(namespace, name)

      if (!deepEqual(virtualService.spec, spec)) {
        this.log.info(`Patching virtual service ${name}.${namespace}`)

        await this.virtualServiceApi.patchVirtualService(namespace, name, [
          {
            op: 'replace',
            path: '/spec',
            value: spec,
          },
        ])
      }
    } catch (error) {
      if (error.body?.code === 404) {
        this.log.info(`Creating virtual service ${name}.${namespace}`)

        await this.virtualServiceApi.createVirtualService(namespace, name, spec)
      } else {
        throw error
      }
    }
  }

  private async resourceDeleted(resource) {
    const automation = this.parseAnnotations(
      resource.metadata?.annotations?.['preview.monstrs.tech/automation']
    )

    if (automation?.endpoint) {
      const namespace = automation.endpoint.namespace || 'istio-system'
      const name = `preview-${resource.metadata!.namespace || 'default'}-${resource.metadata!
        .name!}`

      this.log.info(`Deleting virtual service ${name}.${namespace}`)

      await this.virtualServiceApi.deleteVirtualService(namespace, name)
    }
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
  }
}
