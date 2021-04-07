import { KubernetesObject } from '@kubernetes/client-node'
import YAML                 from 'yaml'

export const resourcesToString = (resources: Array<KubernetesObject>): string =>
  resources.map((resource: KubernetesObject) => YAML.stringify(resource)).join('---\n')

export const stringToResources = (resourcesString: string): Array<KubernetesObject> =>
  `\n${resourcesString}\n`
    .split(/\n---+\n/)
    .map((resource: string) => YAML.parse(resource.trim()) as KubernetesObject)
