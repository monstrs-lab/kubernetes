import { join }    from 'node:path'

import { cluster } from '@monstrs/k8s-test-utils'

export default async () => {
  await cluster.start()

  await cluster.apply(join(__dirname, '../../../manifests/preview-automation'))
  await cluster.apply(join(__dirname, '../../../manifests/flux'))
  await cluster.apply(join(__dirname, '../../../manifests/istio'))
}
