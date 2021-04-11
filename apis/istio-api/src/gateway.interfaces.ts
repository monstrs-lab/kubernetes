import { KubernetesObject } from '@kubernetes/client-node'

export interface GatewaySelector {
  istio: string
}

export interface GatewayServerPort {
  number: number
  name: string
  protocol: string
}

export interface GatewayServerTls {
  mode: string
  credentialName: string
}

export interface GatewayServer {
  port: GatewayServerPort
  hosts: Array<string>
  tls: GatewayServerTls
}

export interface GatewaySpec {
  selector: GatewaySelector
  servers: Array<GatewayServer>
}

export interface GatewayResource extends KubernetesObject {
  spec: GatewaySpec
}
