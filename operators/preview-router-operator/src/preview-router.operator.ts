import { KubeConfig }                  from '@kubernetes/client-node'
import { HttpError }                   from '@kubernetes/client-node'

import deepEqual                       from 'deep-equal'

import { VirtualServiceApi }           from '@monstrs/k8s-istio-api'
import { Operator }                    from '@monstrs/k8s-operator'
import { ResourceEventType }           from '@monstrs/k8s-operator'
import { PreviewAutomationAnnotation } from '@monstrs/k8s-preview-automation-api'

export class PreviewRouterOperator extends Operator {
  private readonly virtualServiceApi: VirtualServiceApi

  constructor(kubeConfig?: KubeConfig) {
    super(kubeConfig)

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
      const virtualService = await this.virtualServiceApi.getVirtualService(name, namespace)

      if (!deepEqual(virtualService.spec, spec)) {
        this.logger.info(`Patching virtual service ${name}.${namespace}`)

        await this.virtualServiceApi.patchVirtualService(
          name,
          [
            {
              op: 'replace',
              path: '/spec',
              value: spec,
            },
          ],
          namespace
        )
      }
    } catch (error) {
      if ((error as HttpError).body?.code === 404) {
        this.logger.info(`Creating virtual service ${name}.${namespace}`)

        await this.virtualServiceApi.createVirtualService(name, spec, namespace)
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

      this.logger.info(`Deleting virtual service ${name}.${namespace}`)

      await this.virtualServiceApi.deleteVirtualService(name, namespace)
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
          this.logger.error((error as HttpError).body)
        }
      }
    })
  }
}
