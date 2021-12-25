import { KubernetesObject }  from '@kubernetes/client-node'

import { ResourceEventType } from './operator.enums'
import { ResourceMeta }      from './resource-meta.impl'

export interface ResourceEvent {
  meta: ResourceMeta
  type: ResourceEventType
  object: KubernetesObject
}

export type EventQueue = {
  onEvent: (event: ResourceEvent) => Promise<void>
  event: ResourceEvent
}
