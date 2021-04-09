import { CustomObjectsApi } from '@kubernetes/client-node'

import { Logger }           from '@monstrs/logger'

import { IngressGenerator } from './ingress-generator.interfaces'

export class IstioIngressGenerator implements IngressGenerator {
  private readonly logger = new Logger(IstioIngressGenerator.name)

  constructor(private readonly k8sCustomObjectsApi: CustomObjectsApi) {}

  private async getVirtualService(namespace: string, name: string) {
    try {
      const { body } = await this.k8sCustomObjectsApi.getNamespacedCustomObject(
        'networking.istio.io',
        'v1alpha3',
        namespace,
        'virtualservices',
        name
      )

      return body
    } catch {
      return null
    }
  }

  private async patchVirtualService(namespace: string, name: string, host: string, port: number) {
    this.logger.info(`Patch istio virtual service ${namespace}.${name} for host ${host}`)

    return this.k8sCustomObjectsApi.patchNamespacedCustomObject(
      'networking.istio.io',
      'v1alpha3',
      namespace,
      'virtualservices',
      name,
      [
        {
          op: 'replace',
          path: '/spec',
          value: {
            hosts: [host],
            gateways: [name],
            http: [
              {
                route: [
                  {
                    destination: {
                      host: name,
                      port: {
                        number: port,
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      ],
      undefined,
      undefined,
      undefined,
      {
        headers: { 'Content-Type': 'application/json-patch+json' },
      }
    )
  }

  private async createVirtualService(namespace: string, name: string, host: string, port: number) {
    this.logger.info(`Create istio virtual service ${namespace}.${name} for host ${host}`)

    return this.k8sCustomObjectsApi.createNamespacedCustomObject(
      'networking.istio.io',
      'v1alpha3',
      namespace,
      'virtualservices',
      {
        apiVersion: 'networking.istio.io/v1alpha3',
        kind: 'VirtualService',
        metadata: {
          namespace,
          name,
        },
        spec: {
          hosts: [host],
          gateways: [name],
          http: [
            {
              route: [
                {
                  destination: {
                    host: name,
                    port: {
                      number: port,
                    },
                  },
                },
              ],
            },
          ],
        },
      }
    )
  }

  private async deleteVirtualService(namespace: string, name: string) {
    this.logger.info(`Delete istio virtual service ${namespace}.${name}`)

    return this.k8sCustomObjectsApi.deleteNamespacedCustomObject(
      'networking.istio.io',
      'v1alpha3',
      namespace,
      'virtualservices',
      name
    )
  }

  private async getGateway(namespace: string, name: string) {
    try {
      const { body } = await this.k8sCustomObjectsApi.getNamespacedCustomObject(
        'networking.istio.io',
        'v1alpha3',
        namespace,
        'gateways',
        name
      )

      return body
    } catch {
      return null
    }
  }

  private async patchGateway(namespace: string, name: string, host: string, tls: boolean = false) {
    this.logger.info(`Patch istio gateway ${namespace}.${name} for host ${host}`)

    return this.k8sCustomObjectsApi.patchNamespacedCustomObject(
      'networking.istio.io',
      'v1alpha3',
      namespace,
      'gateways',
      name,
      [
        {
          op: 'replace',
          path: '/spec',
          value: {
            selector: {
              istio: 'ingressgateway',
            },
            servers: [
              {
                port: tls
                  ? {
                      number: 443,
                      name: 'https',
                      protocol: 'HTTPS',
                    }
                  : {
                      number: 80,
                      name: 'http',
                      protocol: 'HTTP',
                    },
                hosts: [host],
                ...(tls ? { tls: { mode: 'SIMPLE', credentialName: name } } : {}),
              },
            ],
          },
        },
      ],
      undefined,
      undefined,
      undefined,
      {
        headers: { 'Content-Type': 'application/json-patch+json' },
      }
    )
  }

  private async createGateway(namespace: string, name: string, host: string, tls: boolean = false) {
    this.logger.info(`Create istio gateway ${namespace}.${name} for host ${host}`)

    return this.k8sCustomObjectsApi.createNamespacedCustomObject(
      'networking.istio.io',
      'v1alpha3',
      namespace,
      'gateways',
      {
        apiVersion: 'networking.istio.io/v1alpha3',
        kind: 'Gateway',
        metadata: {
          namespace,
          name,
        },
        spec: {
          selector: {
            istio: 'ingressgateway',
          },
          servers: [
            {
              port: tls
                ? {
                    number: 443,
                    name: 'https',
                    protocol: 'HTTPS',
                  }
                : {
                    number: 80,
                    name: 'http',
                    protocol: 'HTTP',
                  },
              hosts: [host],
              ...(tls ? { tls: { mode: 'SIMPLE', credentialName: name } } : {}),
            },
          ],
        },
      }
    )
  }

  private async deleteGateway(namespace: string, name: string) {
    this.logger.info(`Delete istio gateway ${namespace}.${name}`)

    return this.k8sCustomObjectsApi.deleteNamespacedCustomObject(
      'networking.istio.io',
      'v1alpha3',
      namespace,
      'gateways',
      name
    )
  }

  async apply(namespace: string, name: string, host: string, port: number, tls?: boolean) {
    if (await this.getVirtualService(namespace, name)) {
      await this.patchVirtualService(namespace, name, host, port)
    } else {
      await this.createVirtualService(namespace, name, host, port)
    }

    if (await this.getGateway(namespace, name)) {
      await this.patchGateway(namespace, name, host, tls)
    } else {
      await this.createGateway(namespace, name, host, tls)
    }
  }

  async delete(namespace: string, name: string) {
    if (await this.getVirtualService(namespace, name)) {
      await this.deleteVirtualService(namespace, name)
    }

    if (await this.getGateway(namespace, name)) {
      await this.deleteGateway(namespace, name)
    }
  }
}
