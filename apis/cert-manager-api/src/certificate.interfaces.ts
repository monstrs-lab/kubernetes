import { KubernetesObject } from '@kubernetes/client-node'

export interface CertificateIssuerRef {
  name: string
  kind: string
}

export interface CertificateSpec {
  secretName: string
  commonName: string
  dnsNames: Array<string>
  issuerRef: CertificateIssuerRef
}

export interface CertificateResource extends KubernetesObject {
  spec: CertificateSpec
}
