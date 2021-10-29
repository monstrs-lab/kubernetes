import { KubeConfig }          from '@kubernetes/client-node'
import { KubernetesObjectApi } from '@kubernetes/client-node'
import { KubernetesObject }    from '@kubernetes/client-node'
import { HttpError }    from '@kubernetes/client-node'
import { Logger } from '@monstrs/logger'
import { loadAll }             from 'js-yaml'
import { readdir }             from 'node:fs/promises'
import { readFile }            from 'node:fs/promises'
import { extname }             from 'node:path'
import { join }                from 'node:path'

export class KubeCtl {
  private readonly logger = new Logger(KubeCtl.name)

  #kubeConfig: KubeConfig

  #client: KubernetesObjectApi

  constructor(kubeConfig: KubeConfig) {
    this.#kubeConfig = kubeConfig
    this.#client = KubernetesObjectApi.makeApiClient(kubeConfig)
  }

  async applyFolder(specPath: string) {
    const files = (await readdir(specPath)).filter((file) =>
      ['.yaml', '.yml'].includes(extname(file))
    )
    const specs: Array<any> = (
      await Promise.all(files.map((file) => readFile(join(specPath, file), 'utf8')))
    )
      .map((content) => loadAll(content))
      .flat()

    await this.apply(specs)
  }

  async apply(specs: Array<KubernetesObject>) {
    const validSpecs = specs.filter((spec: any) => spec?.kind && spec?.metadata)

    for (const spec of validSpecs) {
      spec.metadata = spec.metadata || {}
      spec.metadata.annotations = spec.metadata.annotations || {}
      delete spec.metadata.annotations['kubectl.kubernetes.io/last-applied-configuration']
      spec.metadata.annotations['kubectl.kubernetes.io/last-applied-configuration'] =
        JSON.stringify(spec)

      try {
        await this.#client.read(spec)
        await this.#client.patch(spec, undefined, undefined, undefined, undefined, { headers: { 'content-type': 'application/merge-patch+json' } })
      } catch (error) {
        if ((error as HttpError).body.code !== 404) {
          this.logger.error((error as HttpError).body)
        }

        await this.#client.create(spec)
      }
    }
  }

  async delete(spec: KubernetesObject | Array<KubernetesObject>) {
    const specs = Array.isArray(spec) ? spec : [spec]

    return Promise.all(specs.map((s) => this.#client.delete(s)))
  }
}
