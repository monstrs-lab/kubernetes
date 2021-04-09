import { CustomObjectsApi } from '@kubernetes/client-node'

import { Logger }           from '@monstrs/logger'

import { TlsGenerator }     from './tls-generator.interfaces'

export class CertManagerTlsGenerator implements TlsGenerator {
  private readonly logger = new Logger(CertManagerTlsGenerator.name)

  constructor(private readonly k8sCustomObjectsApi: CustomObjectsApi) {}

  private async getCertificate(namespace: string, name: string) {
    try {
      const { body } = await this.k8sCustomObjectsApi.getNamespacedCustomObject(
        'cert-manager.io',
        'v1alpha2',
        namespace,
        'certificates',
        name
      )

      return body
    } catch {
      return null
    }
  }

  private async patchCertificat(namespace: string, name: string, host: string) {
    this.logger.info(`Patch cert manager certificate ${namespace}.${name} for host ${host}`)

    return this.k8sCustomObjectsApi.patchNamespacedCustomObject(
      'cert-manager.io',
      'v1alpha2',
      namespace,
      'certificates',
      name,
      [
        {
          op: 'replace',
          path: '/spec',
          value: {
            secretName: name,
            issuerRef: {
              name: 'letsencrypt',
              kind: 'ClusterIssuer',
            },
            commonName: host,
            dnsNames: [host],
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

  private async createCertificate(namespace: string, name: string, host: string) {
    this.logger.info(`Create cert manager certificate ${namespace}.${name} for host ${host}`)

    return this.k8sCustomObjectsApi.createNamespacedCustomObject(
      'cert-manager.io',
      'v1alpha2',
      namespace,
      'certificates',
      {
        apiVersion: 'cert-manager.io/v1alpha2',
        kind: 'Certificate',
        metadata: {
          namespace,
          name,
        },
        spec: {
          secretName: name,
          issuerRef: {
            name: 'letsencrypt',
            kind: 'ClusterIssuer',
          },
          commonName: host,
          dnsNames: [host],
        },
      }
    )
  }

  private async deleteCertificate(namespace: string, name: string) {
    this.logger.info(`Delete cert manager certificate ${namespace}.${name}`)

    return this.k8sCustomObjectsApi.deleteNamespacedCustomObject(
      'cert-manager.io',
      'v1alpha2',
      namespace,
      'certificates',
      name
    )
  }

  async apply(namespace: string, name: string, host: string) {
    if (await this.getCertificate(namespace, name)) {
      await this.patchCertificat(namespace, name, host)
    } else {
      await this.createCertificate(namespace, name, host)
    }
  }

  async delete(namespace: string, name: string) {
    if (await this.getCertificate(namespace, name)) {
      await this.deleteCertificate(namespace, name)
    }
  }
}
