import { KubernetesObject } from '@kubernetes/client-node'

export interface VirtualServiceHttpRouteDestinationPort {
  number: number
}

export interface VirtualServiceHttpRouteDestination {
  host: string
  port: VirtualServiceHttpRouteDestinationPort
}

export interface VirtualServiceHttpRoute {
  destination: VirtualServiceHttpRouteDestination
}

export interface VirtualServiceHttp {
  route: Array<VirtualServiceHttpRoute>
}

export interface VirtualServiceSpec {
  http: Array<VirtualServiceHttp>
  gateways: Array<string>
  hosts: Array<string>
}

export interface VirtualServiceResource extends KubernetesObject {
  spec: VirtualServiceSpec
}
