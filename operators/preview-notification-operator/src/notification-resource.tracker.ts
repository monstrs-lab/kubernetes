import { V1Deployment } from '@kubernetes/client-node'

export class NotificationResourceTracker {
  private readonly resources = new Set<string>()

  private getResourceKey(resource: V1Deployment) {
    return resource.spec?.template?.spec?.containers?.map((container) => container.image).join()
  }

  add(resource: V1Deployment) {
    const key = this.getResourceKey(resource)

    if (key) {
      this.resources.add(key)
    }
  }

  has(resource: V1Deployment): boolean {
    const key = this.getResourceKey(resource)

    return key ? this.resources.has(key) : false
  }
}
