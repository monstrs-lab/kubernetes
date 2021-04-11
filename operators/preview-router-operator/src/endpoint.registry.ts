import { PreviewEndpointResource } from '@monstrs/k8s-preview-automation-api'
import { CertificateApi }          from '@monstrs/k8s-cert-manager-api'
import { GatewayApi }              from '@monstrs/k8s-istio-api'

export interface EndpointRegistryItem {
  url: string
  gateway: string
}

export class EndpointRegistry {
  private readonly endpoints = new Map<string, EndpointRegistryItem>()

  constructor(
    private readonly certificateApi: CertificateApi,
    private readonly gatewayApi: GatewayApi
  ) {}

  async addEndpoint(endpoint: PreviewEndpointResource) {
    const item = this.endpoints.get(endpoint.metadata!.name!)

    const name = `preview-${endpoint.metadata!.namespace || 'default'}-${endpoint.metadata!.name!}`

    const certificateSpec = {
      secretName: name,
      issuerRef: {
        name: 'letsencrypt',
        kind: 'ClusterIssuer',
      },
      commonName: endpoint.spec.url,
      dnsNames: [endpoint.spec.url, `*.${endpoint.spec.url}`],
    }

    const gatewaySpec = {
      selector: {
        istio: 'ingressgateway',
      },
      servers: [
        {
          port: {
            number: 443,
            name: 'https',
            protocol: 'HTTPS',
          },
          hosts: [endpoint.spec.url, `*.${endpoint.spec.url}`],
          tls: { mode: 'SIMPLE', credentialName: name },
        },
      ],
    }

    if (!item) {
      await this.certificateApi.createCertificate('istio-system', name, certificateSpec)
      await this.gatewayApi.createGateway('istio-system', name, gatewaySpec)

      this.endpoints.set(endpoint.metadata!.name!, {
        url: endpoint.spec.url,
        gateway: name,
      })
    } else if (item && item.url !== endpoint.spec.url) {
      await this.certificateApi.patchCertificate('istio-system', name, [
        {
          op: 'replace',
          path: '/spec',
          value: certificateSpec,
        },
      ])

      await this.gatewayApi.patchGateway('istio-system', name, [
        {
          op: 'replace',
          path: '/spec',
          value: gatewaySpec,
        },
      ])
    }
  }

  async deleteEndpoint(endpoint: PreviewEndpointResource) {
    const item = this.endpoints.get(endpoint.metadata!.name!)

    if (item) {
      const name = `preview-${endpoint.metadata!.namespace || 'default'}-${endpoint.metadata!
        .name!}`

      await this.certificateApi.deleteCertificate('istio-system', name)
      await this.gatewayApi.deleteGateway('istio-system', name)

      this.endpoints.delete(endpoint.metadata!.name!)
    }
  }

  async getEndpoint(name: string) {
    return this.endpoints.get(name)
  }
}
