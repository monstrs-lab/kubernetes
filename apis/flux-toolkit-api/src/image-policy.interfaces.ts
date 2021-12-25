import { KubernetesObject } from '@kubernetes/client-node'

export interface ImagePolicyFilterTags {
  pattern: string
}

export interface ImagePolicySpec {
  filterTags: ImagePolicyFilterTags
}

export interface ImagePolicyStatus {
  latestImage: string
}

export interface ImagePolicyResource extends KubernetesObject {
  spec: ImagePolicySpec
  status: ImagePolicyStatus
}
