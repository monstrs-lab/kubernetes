/* eslint-disable no-await-in-loop */
/* eslint-disable no-shadow */

import { Agent }                   from 'node:https'
import { RequestOptions }          from 'node:https'

import { KubeConfig }              from '@kubernetes/client-node'
import { CoreV1Api }               from '@kubernetes/client-node'
import { KubernetesObject }        from '@kubernetes/client-node'
import { HttpError }               from '@kubernetes/client-node'
import { Logger }                  from '@monstrs/logger'

import Axios                       from 'axios'
import { QueueObject }             from 'async'
import { AxiosRequestConfig }      from 'axios'
import { Method as HttpMethod }    from 'axios'
import { queue }                   from 'async'

import { ResourceEventType }       from './operator.enums'
import { ResourceEvent }           from './operator.interfaces'
import { EventQueue }              from './operator.interfaces'
import { ResourceMetaImpl }        from './resource-meta.impl'
import { ResourceMeta }            from './resource-meta.impl'
import { Watch }                   from './watch'
import { getCustomResourceApiUri } from './resource.utils'
import { getResourceApiUri }       from './resource.utils'

export abstract class Operator {
  protected abortController = new AbortController()

  protected readonly logger: Logger

  protected kubeConfig: KubeConfig

  protected k8sApi: CoreV1Api

  private resourcePathBuilders: Record<string, (meta: ResourceMeta) => string> = {}

  private eventQueue: QueueObject<{
    event: ResourceEvent
    onEvent: (event: ResourceEvent) => Promise<void>
  }> = queue<EventQueue>(async (args) => args.onEvent(args.event))

  constructor(kubeConfig?: KubeConfig) {
    this.logger = new Logger(this.constructor.name)

    if (kubeConfig) {
      this.kubeConfig = kubeConfig
    } else {
      this.kubeConfig = new KubeConfig()
      this.kubeConfig.loadFromDefault()
    }

    this.k8sApi = this.kubeConfig.makeApiClient(CoreV1Api)
  }

  public async start(): Promise<void> {
    return this.init()
  }

  public stop(): void {
    this.abortController.abort()
  }

  protected abstract init(): Promise<void>

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
      this.k8sApi.basePath + getCustomResourceApiUri(group, version, plural, meta.namespace)

    const uri = getResourceApiUri(group, version, plural, namespace)

    const watch = new Watch(this.kubeConfig, this.abortController.signal)

    while (!this.abortController.signal.aborted) {
      await watch.watch(uri, (phase, object) =>
        this.eventQueue.push({
          event: {
            meta: ResourceMetaImpl.createWithPlural(plural, object),
            type: phase as ResourceEventType,
            object,
          },
          onEvent,
        }))
    }
  }

  protected async handleResourceFinalizer(
    event: ResourceEvent,
    finalizer: string,
    deleteAction: (event: ResourceEvent) => Promise<void>
  ): Promise<boolean> {
    const { metadata } = event.object

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
      const finalizers = metadata.finalizers ?? []

      finalizers.push(finalizer)

      await this.setResourceFinalizers(event.meta, finalizers)

      return true
    }

    if (metadata.deletionTimestamp) {
      if (metadata.finalizers && metadata.finalizers.includes(finalizer)) {
        await deleteAction(event)

        const finalizers = metadata.finalizers.filter((f) => f !== finalizer)

        await this.setResourceFinalizers(event.meta, finalizers)
      }

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
      }
    })
  }

  protected async applyAxiosKubeConfigAuth(request: AxiosRequestConfig): Promise<void> {
    const opts: RequestOptions = {}

    await this.kubeConfig.applytoHTTPSOptions(opts)

    if (opts.headers?.Authorization) {
      request.headers = request.headers ?? {}
      request.headers.Authorization = opts.headers.Authorization as string
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

  protected async setResourceStatus(
    meta: ResourceMeta,
    status: unknown
  ): Promise<ResourceMeta | null> {
    return this.resourceStatusRequest('PUT', meta, status)
  }

  protected async patchResourceStatus(
    meta: ResourceMeta,
    status: unknown
  ): Promise<ResourceMeta | null> {
    return this.resourceStatusRequest('PATCH', meta, status)
  }

  private async resourceStatusRequest(
    method: HttpMethod,
    meta: ResourceMeta,
    status: unknown
  ): Promise<ResourceMeta | null> {
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
      url: `${this.resourcePathBuilders[meta.id](meta)}/${meta.name}/status`,
      data: body,
      method,
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
    } catch (error) {
      this.logger.error((error as HttpError).body)

      return null
    }
  }
}
