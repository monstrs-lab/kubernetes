/* eslint-disable no-param-reassign */

import type { KubernetesObjectApi } from '@kubernetes/client-node'
import type { KubernetesObject }    from '@kubernetes/client-node'
import type { HttpError }           from '@kubernetes/client-node'

export const isObjectExists = async <S extends KubernetesObject>(
  client: KubernetesObjectApi,
  spec: S
): Promise<boolean> => {
  try {
    await client.read(spec)

    return true
  } catch (error) {
    const { statusCode, body = {} } = error as HttpError

    if (statusCode === 404 && body.code === 404) {
      return false
    }

    throw error
  }
}

export const apply = async <S extends KubernetesObject>(client: KubernetesObjectApi, spec: S) => {
  spec.metadata = spec.metadata || {}
  spec.metadata.annotations = spec.metadata.annotations || {}
  delete spec.metadata.annotations['kubectl.kubernetes.io/last-applied-configuration']
  spec.metadata.annotations['kubectl.kubernetes.io/last-applied-configuration'] =
    JSON.stringify(spec)

  const exists = await isObjectExists(client, spec)

  if (exists) {
    await client.patch(spec, undefined, undefined, undefined, undefined, {
      headers: { 'content-type': 'application/merge-patch+json' },
    })
  } else {
    await client.create(spec)
  }
}
