import { KubeConfig }            from '@kubernetes/client-node'

import { join }                  from 'path'
import { retry }                 from 'retry-ignore-abort'

import { VirtualServiceApi }     from '@monstrs/k8s-istio-api'
import { cluster }               from '@monstrs/k8s-test-utils'

import { PreviewRouterOperator } from '../src'

jest.setTimeout(120000)

describe('preview-router.operator', () => {
  let operator: PreviewRouterOperator
  let kubeConfig: KubeConfig

  beforeAll(async () => {
    kubeConfig = await cluster.getKubeConfig()

    await cluster.apply(join(__dirname, 'specs'))
  })

  beforeEach(async () => {
    operator = new PreviewRouterOperator(kubeConfig)

    operator.start()
  })

  afterEach(async () => {
    if (operator) {
      operator.stop()
    }
  })

  it('create virtual service', async () => {
    const virtualServiceApi = new VirtualServiceApi(kubeConfig)

    const virtualService = await retry(
      async () => virtualServiceApi.getVirtualService('preview-default-preview-router-test'),
      {
        retries: 5,
      }
    )

    expect(virtualService).toBeDefined()
  })
})
