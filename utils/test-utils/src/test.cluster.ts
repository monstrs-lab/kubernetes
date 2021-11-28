import { readdir }             from 'node:fs/promises'
import { readFile }            from 'node:fs/promises'
import { extname }             from 'node:path'
import { join }                from 'node:path'

import { KubernetesObjectApi } from '@kubernetes/client-node'
import { KubeConfig }          from '@kubernetes/client-node'
import { KubernetesObject }    from '@kubernetes/client-node'
import { HttpError }           from '@kubernetes/client-node'
import { Logger }              from '@monstrs/logger'
import { loadAllYaml }         from '@kubernetes/client-node'

import { k3d }                 from '@monstrs/k8s-k3d'

export class TestCluster {
  public static NAME = 'test-cluster'

  private readonly logger = new Logger(TestCluster.name)

  #kubeConfig!: KubeConfig

  #client!: KubernetesObjectApi

  async getKubeConfig() {
    if (!this.#kubeConfig) {
      this.#kubeConfig = new KubeConfig()
      this.#kubeConfig.loadFromString(await k3d.kubeconfig.get(TestCluster.NAME))
    }

    return this.#kubeConfig
  }

  async makeApiClient() {
    if (!this.#client) {
      this.#client = KubernetesObjectApi.makeApiClient(await this.getKubeConfig())
    }

    return this.#client
  }

  async start() {
    if (await k3d.cluster.get(TestCluster.NAME)) {
      await k3d.cluster.delete(TestCluster.NAME)
    }

    await k3d.cluster.create(TestCluster.NAME)
  }

  async stop() {
    await k3d.cluster.delete(TestCluster.NAME)
  }

  async apply(specPath: string) {
    const files = (await readdir(specPath)).filter((file) =>
      ['.yaml', '.yml'].includes(extname(file)))
    const specs: Array<KubernetesObject> = (
      await Promise.all(files.map((file) => readFile(join(specPath, file), 'utf8')))
    )
      .map((content) => loadAllYaml(content))
      .flat()

    if (Array.isArray(specs)) {
      return Promise.all(specs.map((spec) => this.applySpec(spec)))
    }

    return this.applySpec(specs)
  }

  async applySpec<S extends KubernetesObject>(spec: S) {
    // eslint-disable-next-line no-param-reassign
    spec.metadata = spec.metadata || {}
    // eslint-disable-next-line no-param-reassign
    spec.metadata.annotations = spec.metadata.annotations || {}
    // eslint-disable-next-line no-param-reassign
    delete spec.metadata.annotations['kubectl.kubernetes.io/last-applied-configuration']
    // eslint-disable-next-line no-param-reassign
    spec.metadata.annotations['kubectl.kubernetes.io/last-applied-configuration'] =
      JSON.stringify(spec)

    const client = await this.makeApiClient()

    try {
      await client.read(spec)
      await client.patch(spec, undefined, undefined, undefined, undefined, {
        headers: { 'content-type': 'application/merge-patch+json' },
      })
    } catch (error) {
      const { statusCode, message, body = {} } = error as HttpError

      if (statusCode === 404 && body.code === 404) {
        await client.create(spec)
      } else {
        this.logger.error({
          ...body,
          message: body.message || message,
        })

        throw error
      }
    }
  }
}

export const cluster = new TestCluster()
