import { KubeConfig }                from '@kubernetes/client-node'
import { HttpError }                 from '@kubernetes/client-node'

import faker                         from 'faker'
import { join }                      from 'path'
import { retry }                     from 'retry-ignore-abort'

import { PreviewVersionApi }         from '@monstrs/k8s-preview-automation-api'
import { PreviewAutomationApi }      from '@monstrs/k8s-preview-automation-api'
import { cluster }                   from '@monstrs/k8s-test-utils'

import { PreviewAutomationOperator } from '../src'

jest.setTimeout(30000)

describe('preview-automation.operator', () => {
  let previewAutomationApi: PreviewAutomationApi
  let previewVersionApi: PreviewVersionApi
  let operator: PreviewAutomationOperator
  let kubeConfig: KubeConfig

  beforeAll(async () => {
    kubeConfig = await cluster.getKubeConfig()

    previewVersionApi = new PreviewVersionApi(kubeConfig)
    previewAutomationApi = new PreviewAutomationApi(kubeConfig)

    await cluster.apply(join(__dirname, 'specs'))
  })

  beforeEach(async () => {
    operator = new PreviewAutomationOperator(kubeConfig)

    operator.start()
  })

  afterEach(async () => {
    if (operator) {
      operator.stop()
    }
  })

  it('create and delete preview version', async () => {
    const resource = faker.random.word().toLowerCase()

    await previewAutomationApi.createPreviewAutomation(resource, {
      imageRepositoryRef: {
        namespace: 'flux-system',
        name: 'test',
      },
      sourceRef: {
        kind: 'GitRepository',
        namespace: 'flux-system',
        name: 'test',
      },
      resources: [
        {
          name: 'preview-operator-test',
          kind: 'Deployment',
        },
        {
          name: 'preview-operator-test',
          kind: 'Service',
        },
      ],
    })

    await previewVersionApi.createPreviewVersion(resource, {
      previewAutomationRef: {
        namespace: 'default',
        name: resource,
      },
      tag: resource,
      context: {
        kind: 'GitPullRequest',
        number: resource,
      },
    })

    const previewVersion = await retry(
      async () => {
        const version = await previewVersionApi.getPreviewVersion(resource)

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

    await previewVersionApi.deletePreviewVersion(resource)

    const deleted = await retry(
      async () => {
        try {
          if (await previewVersionApi.getPreviewVersion(resource)) {
            throw new Error('Preview version exist')
          }
        } catch (error) {
          if ((error as HttpError).statusCode !== 404) {
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
