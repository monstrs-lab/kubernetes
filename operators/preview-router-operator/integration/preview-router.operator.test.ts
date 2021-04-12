/**
 * @jest-environment node
 */

import { KubeConfig }            from '@kubernetes/client-node'
import { retry }                 from 'retry-ignore-abort'
import { join }                  from 'path'

import { kubectl }               from '@monstrs/k8s-kubectl-tool'
import { VirtualServiceApi }     from '@monstrs/k8s-istio-api'

import { PreviewRouterOperator } from '../src'

jest.setTimeout(120000)

describe('preview-router.operator', () => {
  const operator = new PreviewRouterOperator()
  let virtualServiceApi: VirtualServiceApi

  beforeAll(async () => {
    const kubeConfig = new KubeConfig()

    kubeConfig.loadFromDefault()

    virtualServiceApi = new VirtualServiceApi(kubeConfig)

    // TODO: run only on ci
    await kubectl.run(['apply', '-f', join(__dirname, 'crd'), '--recursive'])
    await kubectl.run(['apply', '-f', join(__dirname, 'specs'), '--recursive'])

    await operator.start()
  })

  afterAll(async () => {
    await operator.stop()
  })

  it('create virtual service', async () => {
    const virtualService = await retry(
      async () =>
        virtualServiceApi.getVirtualService('default', 'preview-default-preview-router-test'),
      {
        retries: 5,
      }
    )

    expect(virtualService).toBeDefined()
  })
})
