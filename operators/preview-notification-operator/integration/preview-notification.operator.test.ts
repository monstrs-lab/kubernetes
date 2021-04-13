/**
 * @jest-environment node
 */

import { KubeConfig }                  from '@kubernetes/client-node'
import { AppsV1Api }                   from '@kubernetes/client-node'
import { retry }                       from 'retry-ignore-abort'

import { PreviewNotificationOperator } from '../src'

jest.setTimeout(30000)

const createComment = jest.fn()

jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    issues: {
      createComment,
    },
  })),
}))

describe('preview-notification.operator', () => {
  const operator = new PreviewNotificationOperator({
    token: 'mock',
  })
  let appsApi: AppsV1Api

  beforeAll(async () => {
    const kubeConfig = new KubeConfig()

    kubeConfig.loadFromDefault()

    if (!kubeConfig.getCurrentContext().includes('test')) {
      throw new Error('Require test kube config context.')
    }

    appsApi = kubeConfig.makeApiClient(AppsV1Api)

    await operator.start()
  })

  afterAll(async () => {
    await operator.stop()
  })

  it('trigger notification', async () => {
    await appsApi.createNamespacedDeployment('default', {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'test-notification',
        annotations: {
          'preview.monstrs.tech/automation': JSON.stringify({
            name: 'preview-router-test',
            endpoint: {
              name: 'preview-router-test',
              namespace: 'default',
              hosts: ['preview-router-test-11.preview.svc.cluster.local'],
            },
            context: { kind: 'GitHubPullRequest', number: 11 },
            source: { kind: 'GitRepository', url: 'https://github.com/monstrs-lab/kubernetes' },
          }),
        },
      },
      spec: {
        selector: {
          matchLabels: {
            app: 'test-notification',
          },
        },
        template: {
          metadata: {
            labels: {
              app: 'test-notification',
            },
          },
          spec: {
            containers: [
              {
                name: 'test-notification',
                image: 'monstrs/preview-operator-test-image:latest',
              },
            ],
          },
        },
      },
    })

    await retry(
      async () => {
        if (createComment.mock.calls.length === 0) {
          throw new Error('Create comment not called')
        }
      },
      {
        retries: 20,
      }
    )

    await appsApi.deleteNamespacedDeployment('test-notification', 'default')

    expect(createComment.mock.calls[0][0].issue_number).toBe(11)
    expect(createComment.mock.calls[0][0].owner).toBe('monstrs-lab')
    expect(createComment.mock.calls[0][0].repo).toBe('kubernetes')
    expect(createComment.mock.calls[0][0].body).toContain(
      'https://preview-router-test-11.preview.svc.cluster.local'
    )
  })
})
