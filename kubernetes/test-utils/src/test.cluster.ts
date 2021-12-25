import { readdir }             from 'node:fs/promises'
import { readFile }            from 'node:fs/promises'
import { extname }             from 'node:path'
import { join }                from 'node:path'

import { KubernetesObjectApi } from '@kubernetes/client-node'
import { KubeConfig }          from '@kubernetes/client-node'
import { KubernetesObject }    from '@kubernetes/client-node'
import { Logger }              from '@monstrs/logger'
import { loadAllYaml }         from '@kubernetes/client-node'

import { k3d }                 from '@monstrs/k8s-k3d'
import { objectUtils }         from '@monstrs/k8s-object-utils'

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

    const client = await this.makeApiClient()

    if (Array.isArray(specs)) {
      for await (const spec of specs) {
        await objectUtils.apply(client, spec)
      }
    } else {
      await objectUtils.apply(client, specs)
    }
  }
}

export const cluster = new TestCluster()
