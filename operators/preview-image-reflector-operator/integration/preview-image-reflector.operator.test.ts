/**
 * @jest-environment node
 */

import { KubeConfig }                    from '@kubernetes/client-node'
import { retry }                         from 'retry-ignore-abort'
import { join }                          from 'path'

import { kubectl }                       from '@monstrs/k8s-kubectl-tool'
import { PreviewVersionApi }             from '@monstrs/k8s-preview-automation-api'
import { ImagePolicyApi }                from '@monstrs/k8s-flux-toolkit-api'

import { PreviewImageReflectorOperator } from '../src'

jest.setTimeout(120000)

describe('preview-image-reflector.operator', () => {
  let previewVersionApi: PreviewVersionApi
  let imagePolicyApi: ImagePolicyApi
  let operator: PreviewImageReflectorOperator

  beforeAll(async () => {
    const kubeConfig = new KubeConfig()

    kubeConfig.loadFromDefault()

    if (!kubeConfig.getCurrentContext().includes('test')) {
      throw new Error('Require test kube config context.')
    }

    previewVersionApi = new PreviewVersionApi(kubeConfig)
    imagePolicyApi = new ImagePolicyApi(kubeConfig)

    // TODO: run only on ci
    await kubectl.run(['apply', '-f', join(__dirname, 'crd'), '--recursive'])
    await kubectl.run(['apply', '-f', join(__dirname, 'specs'), '--recursive'])
  })

  beforeEach(async () => {
    operator = new PreviewImageReflectorOperator()

    await operator.start()

    await retry(
      async () => {
        // @ts-ignore
        const { automations } = operator.automationRegistry

        if (!automations.has('preview-image-reflector-operator-test-flux-system')) {
          throw new Error('Automation not added')
        }
      },
      {
        retries: 5,
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
      async () =>
        previewVersionApi.getPreviewVersion('default', 'preview-image-reflector-operator-test-14'),
      {
        retries: 20,
      }
    )

    expect(previewVersion).toBeDefined()
  })
})
