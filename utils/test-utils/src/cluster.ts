import { k3d }        from '@monstrs/k8s-k3d-tool'
import { KubeConfig } from '@kubernetes/client-node'

export class TestCluster {
  public static NAME = 'operators-test-cluster'

  #kubeConfig!: KubeConfig

  async getKubeConfig() {
    if (!this.#kubeConfig) {
      this.#kubeConfig = new KubeConfig()
      this.#kubeConfig.loadFromString(await k3d.kubeconfig.get(TestCluster.NAME))
    }

    return this.#kubeConfig
  }

  async start() {
    /*
    if (await k3d.cluster.get(TestCluster.NAME)) {
      await k3d.cluster.delete(TestCluster.NAME)
    }

    await k3d.cluster.create(TestCluster.NAME)
    */
  }

  async stop() {
    //await k3d.cluster.delete(TestCluster.NAME)
  }
}
