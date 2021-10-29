import { KubernetesObjectApi } from '@kubernetes/client-node'
import faker                   from 'faker'

import { cluster }             from '../src'

jest.setTimeout(120000)

describe('test.cluster', () => {
  let client: KubernetesObjectApi

  beforeAll(async () => {
    client = await cluster.makeApiClient()
  })

  it('should apply spec', async () => {
    const spec = {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: faker.random.word().toLowerCase(),
      },
      data: {
        extra: 'YmFyCg==',
      },
    }

    await cluster.applySpec(spec)

    await expect(client.read(spec)).resolves.toEqual(
      expect.objectContaining({
        body: expect.objectContaining({
          type: 'Opaque',
          metadata: expect.objectContaining({
            name: spec.metadata.name,
          }),
        }),
      })
    )
  })

  it('should throw unknown spec', async () => {
    await expect(
      cluster.applySpec({
        apiVersion: 'test.monstrs.tech/v1alpha1',
        kind: 'Invalid',
        metadata: {
          name: faker.random.word().toLowerCase(),
        },
      })
    ).rejects.toThrow(
      'Failed to fetch resource metadata for test.monstrs.tech/v1alpha1/Invalid: HTTP request failed'
    )
  })

  it('patch', async () => {
    const spec = {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: faker.random.word().toLowerCase(),
      },
      data: {
        extra: 'YmFyCg==',
      },
    }

    await cluster.applySpec(spec)
    await cluster.applySpec({
      ...spec,
      data: {
        extra: 'dXBkYXRlZAo=',
      },
    })

    await expect(client.read(spec)).resolves.toEqual(
      expect.objectContaining({
        body: expect.objectContaining({
          data: expect.objectContaining({
            extra: 'dXBkYXRlZAo=',
          }),
        }),
      })
    )
  })
})
