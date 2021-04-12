/**
 * @jest-environment node
 */

import { KubeConfig }                from '@kubernetes/client-node'
import { retry }                     from 'retry-ignore-abort'
import { join }                      from 'path'

import { kubectl }                   from '@monstrs/k8s-kubectl-tool'
import { PreviewVersionApi }         from '@monstrs/k8s-preview-automation-api'

import { PreviewAutomationOperator } from '../src'

jest.setTimeout(120000)

describe('preview-automation.operator', () => {
  let previewVersionApi: PreviewVersionApi
  let operator: PreviewAutomationOperator

  beforeAll(async () => {
    const kubeConfig = new KubeConfig()

    kubeConfig.loadFromDefault()

    previewVersionApi = new PreviewVersionApi(kubeConfig)

    // TODO: run only on ci
    await kubectl.run(['apply', '-f', join(__dirname, 'crd'), '--recursive'])
    await kubectl.run(['apply', '-f', join(__dirname, 'specs'), '--recursive'])
  })

  beforeEach(async () => {
    operator = new PreviewAutomationOperator()

    await operator.start()
  })

  afterEach(async () => {
    await operator.stop()
  })

  it('create and delete preview version', async () => {
    await previewVersionApi.createPreviewVersion('default', 'test', {
      previewAutomationRef: {
        namespace: 'default',
        name: 'test',
      },
      tag: 'test',
      context: {
        kind: 'GitPullRequest',
        number: 'test',
      },
    })

    const previewVersion = await retry(
      async () => {
        const version = await previewVersionApi.getPreviewVersion('default', 'test')

        if (!version.status.ready) {
          throw new Error('Preview version not ready')
        }

        return version
      },
      {
        retries: 5,
      }
    )

    expect(previewVersion).toBeDefined()

    await previewVersionApi.deletePreviewVersion('default', 'test')

    const deleted = await retry(
      async () => {
        try {
          if (await previewVersionApi.getPreviewVersion('default', 'test')) {
            throw new Error('Preview version exist')
          }
        } catch (error) {
          if (error.body?.code !== 404) {
            throw new Error('Preview version exist')
          }
        }
      },
      {
        retries: 20,
      }
    )

    expect(deleted).not.toBeDefined()
  })
})
