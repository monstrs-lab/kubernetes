/* eslint-disable max-classes-per-file */

import { retry }    from 'retry-ignore-abort'

import { cluster }  from '@monstrs/k8s-test-utils'

import { Operator } from '../src'

describe('operator', () => {
  it('should start and watch resource', async () => {
    const onEvent = jest.fn()

    class StartAndWatchOperator extends Operator {
      protected async init() {
        await this.watchResource('', 'v1', 'namespaces', onEvent)
      }
    }

    const operator = new StartAndWatchOperator(await cluster.getKubeConfig())

    operator.start()

    await retry(async () => {
      if (onEvent.mock.calls.length === 0) {
        throw new Error('Empty')
      }
    })

    await operator.stop()

    expect(onEvent.mock.calls.length > 0).toBe(true)
  })

  it('should handle error on unknown resource', async () => {
    const onEvent = jest.fn()

    class HandleUnknownResourceOperator extends Operator {
      protected async init() {
        await this.watchResource('', 'v1', 'namespacess', onEvent)
      }
    }

    const operator = new HandleUnknownResourceOperator(await cluster.getKubeConfig())

    await expect(operator.start()).rejects.toThrow('Not Found')
  })
})
