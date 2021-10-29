import { cluster } from '@monstrs/k8s-test-utils'

export default async () => {
  await cluster.start()
}
