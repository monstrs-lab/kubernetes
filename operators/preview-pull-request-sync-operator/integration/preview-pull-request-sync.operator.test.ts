/**
 * @jest-environment node
 */

import { KubeConfig }                     from '@kubernetes/client-node'
import { retry }                          from 'retry-ignore-abort'
import { join }                           from 'path'

import { kubectl }                        from '@monstrs/k8s-kubectl-tool'
import { PreviewVersionApi }              from '@monstrs/k8s-preview-automation-api'

import { PreviewPullRequestSyncOperator } from '../src'

jest.setTimeout(30000)

jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    pulls: {
      get: ({ pull_number }) => ({
        data: {
          state: pull_number === 99 ? 'closed' : 'opened',
        },
      }),
    },
  })),
}))

describe('preview-pull-request-sync.operator', () => {
  let previewVersionApi: PreviewVersionApi
  let operator: PreviewPullRequestSyncOperator

  beforeAll(async () => {
    const kubeConfig = new KubeConfig()

    kubeConfig.loadFromDefault()

    if (!kubeConfig.getCurrentContext().includes('test')) {
      throw new Error('Require test kube config context.')
    }

    previewVersionApi = new PreviewVersionApi(kubeConfig)

    // TODO: run only on ci
    await kubectl.run(['apply', '-f', join(__dirname, 'crd'), '--recursive'])
    await kubectl.run(['apply', '-f', join(__dirname, 'specs'), '--recursive'])
  })

  beforeEach(async () => {
    operator = new PreviewPullRequestSyncOperator({
      token: 'mock',
      schedule: {
        interval: 1000,
      },
    })

    await operator.start()
  })

  afterEach(async () => {
    await operator.stop()
  })

  it('delete preview version on closed pull', async () => {
    const deleted = await retry(
      async () => {
        try {
          if (
            await previewVersionApi.getPreviewVersion(
              'default',
              'preview-pull-request-sync-operator-test-99'
            )
          ) {
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
