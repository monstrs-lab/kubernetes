import { KubernetesObject }         from '@kubernetes/client-node'
import execa                        from 'execa'
import tempy                        from 'tempy'
import YAML                         from 'yaml'
import { join }                     from 'path'
import { promises as fs }           from 'fs'
import { createHash }               from 'crypto'

import { stringToResources }        from '@monstrs/k8s-resource-utils'

import { KustomizeTransformations } from './kustomize.interfaces'

export class Kustomize {
  private readonly cache = new Map<string, Array<KubernetesObject>>()

  getCacheKey(
    resources: Array<KubernetesObject>,
    transformations: KustomizeTransformations
  ): string {
    return createHash('md5')
      .update([...resources, transformations].map((resource) => JSON.stringify(resource)).join(''))
      .digest('hex')
  }

  async build(
    resources: Array<KubernetesObject>,
    transformations: KustomizeTransformations
  ): Promise<Array<KubernetesObject>> {
    const cacheKey = this.getCacheKey(resources, transformations)

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!
    }

    const resourcesFiles = resources.map((resource: KubernetesObject) => ({
      name: `${resource?.metadata?.name}-${resource.kind!.toLowerCase()}.yaml`,
      content: YAML.stringify(resource),
    }))

    const files = resourcesFiles.concat([
      {
        name: 'kustomization.yaml',
        content: YAML.stringify({
          ...transformations,
          resources: resourcesFiles.map((file) => file.name),
        }),
      },
    ])

    const target = tempy.directory()

    await Promise.all(files.map((file) => fs.writeFile(join(target, file.name), file.content)))

    const { stdout } = await execa('kustomize', ['build'], {
      stdin: 'inherit',
      cwd: target,
    })

    const result = stringToResources(stdout)

    this.cache.set(cacheKey, result)

    return result
  }
}
