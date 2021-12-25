import { CustomObjectsApi }           from '@kubernetes/client-node'
import { KubeConfig }                 from '@kubernetes/client-node'

import { kind2Plural }                from '@monstrs/k8s-resource-utils'

import { CertificateResource }        from './certificate.interfaces'
import { CertificateSpec }            from './certificate.interfaces'
import { CertificateResourceVersion } from './certificate.types'
import { CertificateResourceGroup }   from './certificate.types'
import { CertificateResourceKind }    from './certificate.types'
import { CertificateDomain }          from './certificate.types'

export class CertificateApi {
  private readonly customObjectsApi: CustomObjectsApi

  constructor(private readonly kubeConfig: KubeConfig) {
    this.customObjectsApi = this.kubeConfig.makeApiClient(CustomObjectsApi)
  }

  async getCertificate(namespace: string, name: string): Promise<CertificateResource> {
    const { body } = await this.customObjectsApi.getNamespacedCustomObject(
      CertificateDomain.Group,
      CertificateResourceVersion.v1alpha2,
      namespace,
      kind2Plural(CertificateResourceGroup.Certificate),
      name
    )

    return body as CertificateResource
  }

  async createCertificate(namespace: string, name: string, spec: CertificateSpec) {
    return this.customObjectsApi.createNamespacedCustomObject(
      CertificateDomain.Group,
      CertificateResourceVersion.v1alpha2,
      namespace,
      kind2Plural(CertificateResourceGroup.Certificate),
      {
        apiVersion: `${CertificateDomain.Group}/${CertificateResourceVersion.v1alpha2}`,
        kind: CertificateResourceKind.Certificate,
        metadata: {
          namespace,
          name,
        },
        spec,
      }
    )
  }

  async patchCertificate(namespace: string, name: string, body: object) {
    return this.customObjectsApi.patchNamespacedCustomObjectStatus(
      CertificateDomain.Group,
      CertificateResourceVersion.v1alpha2,
      namespace,
      kind2Plural(CertificateResourceGroup.Certificate),
      name,
      body,
      undefined,
      undefined,
      undefined,
      {
        headers: { 'Content-Type': 'application/json-patch+json' },
      }
    )
  }

  async deleteCertificate(namespace: string, name: string) {
    return this.customObjectsApi.deleteNamespacedCustomObject(
      CertificateDomain.Group,
      CertificateResourceVersion.v1alpha2,
      namespace,
      kind2Plural(CertificateResourceGroup.Certificate),
      name
    )
  }
}
