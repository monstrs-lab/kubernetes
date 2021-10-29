import { KubeConfig }                from '@kubernetes/client-node'
import { HttpError }                from '@kubernetes/client-node'
import { retry }                     from 'retry-ignore-abort'
import { join }                      from 'path'
import faker                         from 'faker'
import { setTimeout }                from 'node:timers/promises'

import { cluster }                   from '@monstrs/k8s-test-utils'
import { KubeCtl }                   from '@monstrs/k8s-kubectl-tool'
import { PreviewVersionApi }         from '@monstrs/k8s-preview-automation-api'
import { PreviewAutomationApi }      from '@monstrs/k8s-preview-automation-api'

import { PreviewAutomationOperator } from '../src'

jest.setTimeout(120000)

describe('preview-automation.operator', () => {
  let previewAutomationApi: PreviewAutomationApi
  let previewVersionApi: PreviewVersionApi
  let operator: PreviewAutomationOperator
  let kubeConfig: KubeConfig

  beforeAll(async () => {
    kubeConfig = await cluster.getKubeConfig()

    previewVersionApi = new PreviewVersionApi(kubeConfig)
    previewAutomationApi = new PreviewAutomationApi(kubeConfig)

    const kubectl = new KubeCtl(kubeConfig)

    await kubectl.applyFolder(join(__dirname, 'crd'))
    await kubectl.applyFolder(join(__dirname, 'specs'))
  })

  beforeEach(async () => {
    operator = new PreviewAutomationOperator(kubeConfig)

    await operator.start()
  })

  afterEach(async () => {
      if (operator) {
        operator.stop()
      }
  })

  it('create and delete preview version', async () => {
    const resource = faker.random.word().toLowerCase()

    await setTimeout(5000)
/*
    await previewAutomationApi.createPreviewAutomation('default', resource, {
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
          version: 'apps/v1',
        },
        {
          name: 'preview-operator-test',
          kind: 'Service',
          version: 'v1',
        },
      ],
    })

      await previewVersionApi.createPreviewVersion('default', resource, {
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
        const version = await previewVersionApi.getPreviewVersion('default', resource)

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

    await previewVersionApi.deletePreviewVersion('default', resource)

    const deleted = await retry(
      async () => {
        try {
          if (await previewVersionApi.getPreviewVersion('default', resource)) {
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
    */
  })
})
