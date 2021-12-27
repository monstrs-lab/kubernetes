/**
 * @jest-environment node
 */

import { KubeConfig }                    from '@kubernetes/client-node'

import { join }                          from 'path'
import { retry }                         from 'retry-ignore-abort'

import { ImagePolicyApi }                from '@monstrs/k8s-flux-toolkit-api'
import { PreviewVersionApi }             from '@monstrs/k8s-preview-automation-api'
import { cluster }                       from '@monstrs/k8s-test-utils'

import { PreviewImageReflectorOperator } from '../src'

jest.setTimeout(120000)

describe('preview-image-reflector.operator', () => {
  let previewVersionApi: PreviewVersionApi
  let imagePolicyApi: ImagePolicyApi
  let operator: PreviewImageReflectorOperator
  let kubeConfig: KubeConfig

  beforeAll(async () => {
    kubeConfig = await cluster.getKubeConfig()

    if (!kubeConfig.getCurrentContext().includes('test')) {
      throw new Error('Require test kube config context.')
    }

    previewVersionApi = new PreviewVersionApi(kubeConfig)
    imagePolicyApi = new ImagePolicyApi(kubeConfig)

    await cluster.apply(join(__dirname, 'specs'))
  })

  beforeEach(async () => {
    operator = new PreviewImageReflectorOperator(kubeConfig)

    operator.start()

    await retry(
      async () => {
        if (
          !operator
            .getAutomationRegistry()
            .hasByKey('preview-image-reflector-operator-test-flux-system')
        ) {
          throw new Error('Automation not added')
        }
      },
      {
        retries: 6,
      }
    )
  })

  afterEach(async () => {
    await operator.stop()
  })

  it('trigger create preview version', async () => {
    await imagePolicyApi.patchImagePolicy('flux-system', 'preview-image-reflector-operator-test', [
      {
        op: 'replace',
        path: '/status',
        value: {
          latestImage: 'monstrs/preview-operator-test-image:14-99d4f04-1617363779475',
        },
      },
    ])

    const previewVersion = await retry(
      async () => previewVersionApi.getPreviewVersion('preview-image-reflector-operator-test-14'),
      {
        retries: 20,
      }
    )

    expect(previewVersion).toBeDefined()
  })
})
