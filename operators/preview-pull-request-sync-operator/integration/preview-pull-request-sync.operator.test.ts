import { KubeConfig }                     from '@kubernetes/client-node'
import { HttpError }                      from '@kubernetes/client-node'

import { join }                           from 'path'
import { retry }                          from 'retry-ignore-abort'

import { PreviewVersionApi }              from '@monstrs/k8s-preview-automation-api'
import { cluster }                        from '@monstrs/k8s-test-utils'

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
  let operator: PreviewPullRequestSyncOperator
  let kubeConfig: KubeConfig

  beforeAll(async () => {
    kubeConfig = await cluster.getKubeConfig()

    await cluster.apply(join(__dirname, 'specs'))
  })

  beforeEach(async () => {
    operator = new PreviewPullRequestSyncOperator({
      token: 'mock',
      schedule: {
        interval: 1000,
      },
    })

    operator.start()
  })

  afterEach(async () => {
    await operator.stop()
  })

  it('delete preview version on closed pull', async () => {
    const previewVersionApi = new PreviewVersionApi(kubeConfig)

    const deleted = await retry(
      async () => {
        try {
          if (
            await previewVersionApi.getPreviewVersion('preview-pull-request-sync-operator-test-99')
          ) {
            throw new Error('Preview version exist')
          }
        } catch (error) {
          if ((error as HttpError).body?.code !== 404) {
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
