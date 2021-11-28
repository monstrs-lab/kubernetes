import { readFileSync }                      from 'node:fs'
import { RequestOptions }                    from 'node:https'
import { Agent }                             from 'node:https'

import { HttpError }                         from '@kubernetes/client-node'
import { KubeConfig }                        from '@kubernetes/client-node'
import { KubernetesObject }                  from '@kubernetes/client-node'
import { V1beta1CustomResourceDefinition }   from '@kubernetes/client-node'
import { V1CustomResourceDefinition }        from '@kubernetes/client-node'
import { V1CustomResourceDefinitionVersion } from '@kubernetes/client-node'
import { ApiextensionsV1beta1Api }           from '@kubernetes/client-node'
import { ApiextensionsV1Api }                from '@kubernetes/client-node'
import { CoreV1Api }                         from '@kubernetes/client-node'
import { Watch }                             from '@kubernetes/client-node'
import { Logger }                            from '@monstrs/logger'
import { loadYaml }                          from '@kubernetes/client-node'

import Axios                                 from 'axios'
import { QueueObject }                       from 'async'
import { AxiosRequestConfig }                from 'axios'
import { Method as HttpMethod }              from 'axios'
import { queue }                             from 'async'

import { ResourceMetaImpl }                  from './resource-meta.impl'
import { ResourceMeta }                      from './resource-meta.impl'

export enum ResourceEventType {
  Added = 'ADDED',
  Modified = 'MODIFIED',
  Deleted = 'DELETED',
}

export interface ResourceEvent {
  meta: ResourceMeta
  type: ResourceEventType
  object: KubernetesObject
}

export type EventQueue = {
  onEvent: (event: ResourceEvent) => Promise<void>
  event: ResourceEvent
}

export abstract class Operator {
  protected kubeConfig: KubeConfig
  protected k8sApi: CoreV1Api
  protected readonly logger: Logger

  private resourcePathBuilders: Record<string, (meta: ResourceMeta) => string> = {}
  private watchRequests: Record<string, { abort(): void }> = {}
  private eventQueue: QueueObject<{
    event: ResourceEvent
    onEvent: (event: ResourceEvent) => Promise<void>
  }>

  constructor(kubeConfig?: KubeConfig) {
    this.logger = new Logger(this.constructor.name)

    if (kubeConfig) {
      this.kubeConfig = kubeConfig
    } else {
      this.kubeConfig = new KubeConfig()
      this.kubeConfig.loadFromDefault()
    }

    this.k8sApi = this.kubeConfig.makeApiClient(CoreV1Api)

    this.eventQueue = queue<EventQueue>(async (args) => await args.onEvent(args.event))
  }

  public async start(): Promise<void> {
    await this.init()
  }

  public stop(): void {
    for (const req of Object.values(this.watchRequests)) {
      req.abort()
    }
  }

  protected abstract init(): Promise<void>

  protected async registerCustomResourceDefinition(crdFile: string): Promise<{
    group: string
    versions: V1CustomResourceDefinitionVersion[]
    plural: string
  }> {
    const crd = loadYaml(readFileSync(crdFile, 'utf8')) as V1CustomResourceDefinition
    try {
      const apiVersion = crd.apiVersion as string
      if (!apiVersion || !apiVersion.startsWith('apiextensions.k8s.io/')) {
        throw new Error("Invalid CRD yaml (expected 'apiextensions.k8s.io')")
      }
      if (apiVersion === 'apiextensions.k8s.io/v1beta1') {
        await this.kubeConfig
          .makeApiClient(ApiextensionsV1beta1Api)
          .createCustomResourceDefinition(crd as V1beta1CustomResourceDefinition)
      } else {
        await this.kubeConfig.makeApiClient(ApiextensionsV1Api).createCustomResourceDefinition(crd)
      }
      this.logger.info(`registered custom resource definition '${crd.metadata?.name}'`)
    } catch (err) {
      // API returns a 409 Conflict if CRD already exists.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((err as any).response?.statusCode !== 409) {
        throw err
      }
    }
    return {
      group: crd.spec.group,
      versions: crd.spec.versions,
      plural: crd.spec.names.plural,
    }
  }

  protected getCustomResourceApiUri(
    group: string,
    version: string,
    plural: string,
    namespace?: string
  ): string {
    let path = group ? `/apis/${group}/${version}/` : `/api/${version}/`
    if (namespace) {
      path += `namespaces/${namespace}/`
    }
    path += plural
    return this.k8sApi.basePath + path
  }

  protected async watchResource(
    group: string,
    version: string,
    plural: string,
    onEvent: (event: ResourceEvent) => Promise<void>,
    namespace?: string
  ): Promise<void> {
    const apiVersion = group ? `${group}/${version}` : `${version}`
    const id = `${plural}.${apiVersion}`

    this.resourcePathBuilders[id] = (meta: ResourceMeta): string =>
      this.getCustomResourceApiUri(group, version, plural, meta.namespace)

    let uri = group ? `/apis/${group}/${version}/` : `/api/${version}/`

    if (namespace) {
      uri += `namespaces/${namespace}/`
    }

    uri += plural

    const watch = new Watch(this.kubeConfig)

    const startWatch = (): Promise<void> =>
      watch
        .watch(
          uri,
          {},
          (phase, obj) =>
            this.eventQueue.push({
              event: {
                meta: ResourceMetaImpl.createWithPlural(plural, obj),
                object: obj,
                type: phase as ResourceEventType,
              },
              onEvent,
            }),
          (err) => {
            if (err) {
              this.logger.error((err as HttpError).body)
              process.exit(1)
            }
            this.logger.debug(`restarting watch on resource ${id}`)
            setTimeout(startWatch, 200)
          }
        )
        .catch((reason) => {
          this.logger.error((reason as HttpError).body)
          process.exit(1)
        })
        .then((req) => (this.watchRequests[id] = req))

    await startWatch()

    this.logger.info(`watching resource ${id}`)
  }

  protected async setResourceStatus(
    meta: ResourceMeta,
    status: unknown
  ): Promise<ResourceMeta | null> {
    return await this.resourceStatusRequest('PUT', meta, status)
  }

  protected async patchResourceStatus(
    meta: ResourceMeta,
    status: unknown
  ): Promise<ResourceMeta | null> {
    return await this.resourceStatusRequest('PATCH', meta, status)
  }

  protected async handleResourceFinalizer(
    event: ResourceEvent,
    finalizer: string,
    deleteAction: (event: ResourceEvent) => Promise<void>
  ): Promise<boolean> {
    const metadata = event.object.metadata
    if (
      !metadata ||
      (event.type !== ResourceEventType.Added && event.type !== ResourceEventType.Modified)
    ) {
      return false
    }
    if (
      !metadata.deletionTimestamp &&
      (!metadata.finalizers || !metadata.finalizers.includes(finalizer))
    ) {
      // Make sure our finalizer is added when the resource is first created.
      const finalizers = metadata.finalizers ?? []
      finalizers.push(finalizer)
      await this.setResourceFinalizers(event.meta, finalizers)
      return true
    } else if (metadata.deletionTimestamp) {
      if (metadata.finalizers && metadata.finalizers.includes(finalizer)) {
        // Resource is marked for deletion with our finalizer still set. So run the delete action
        // and clear the finalizer, so the resource will actually be deleted by Kubernetes.
        await deleteAction(event)
        const finalizers = metadata.finalizers.filter((f) => f !== finalizer)
        await this.setResourceFinalizers(event.meta, finalizers)
      }
      // Resource is marked for deletion, so don't process it further.
      return true
    }
    return false
  }

  protected async setResourceFinalizers(meta: ResourceMeta, finalizers: string[]): Promise<void> {
    const request: AxiosRequestConfig = {
      method: 'PATCH',
      url: `${this.resourcePathBuilders[meta.id](meta)}/${meta.name}`,
      data: {
        metadata: {
          finalizers,
        },
      },
      headers: {
        'Content-Type': 'application/merge-patch+json',
      },
    }

    await this.applyAxiosKubeConfigAuth(request)

    await Axios.request(request).catch((error) => {
      if (error) {
        this.logger.error((error as HttpError).body)
        return
      }
    })
  }

  protected async applyAxiosKubeConfigAuth(request: AxiosRequestConfig): Promise<void> {
    const opts: RequestOptions = {}
    await this.kubeConfig.applytoHTTPSOptions(opts)
    if (opts.headers?.Authorization) {
      request.headers = request.headers ?? {}
      request.headers.Authorization = opts.headers.Authorization
    }
    if (opts.auth) {
      const userPassword = opts.auth.split(':')
      request.auth = {
        username: userPassword[0],
        password: userPassword[1],
      }
    }
    if (opts.ca || opts.cert || opts.key) {
      request.httpsAgent = new Agent({
        ca: opts.ca,
        cert: opts.cert,
        key: opts.key,
      })
    }
  }

  private async resourceStatusRequest(
    method: HttpMethod,
    meta: ResourceMeta,
    status: unknown
  ): Promise<ResourceMeta | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = {
      apiVersion: meta.apiVersion,
      kind: meta.kind,
      metadata: {
        name: meta.name,
        resourceVersion: meta.resourceVersion,
      },
      status,
    }
    if (meta.namespace) {
      body.metadata.namespace = meta.namespace
    }
    const request: AxiosRequestConfig = {
      method,
      url: this.resourcePathBuilders[meta.id](meta) + `/${meta.name}/status`,
      data: body,
    }
    if (method === 'patch' || method === 'PATCH') {
      request.headers = {
        'Content-Type': 'application/merge-patch+json',
      }
    }
    await this.applyAxiosKubeConfigAuth(request)
    try {
      const response = await Axios.request<KubernetesObject>(request)
      return response ? ResourceMetaImpl.createWithId(meta.id, response.data) : null
    } catch (err) {
      this.logger.error((err as HttpError).body)
      return null
    }
  }
}
