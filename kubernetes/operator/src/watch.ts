import { Agent }      from 'node:https'

import { KubeConfig } from '@kubernetes/client-node'
import { Logger }     from '@monstrs/logger'

import byline         from 'byline'
import fetch          from 'node-fetch'

export class Watch {
  private readonly logger = new Logger(Watch.name)

  public constructor(
    private readonly kubeConfig: KubeConfig,
    private readonly signal?: AbortSignal
  ) {}

  public async watch(
    path: string,
    onEvent: (phase: string, apiObj: any, watchObj?: any) => void
  ): Promise<any> {
    const cluster = this.kubeConfig.getCurrentCluster()

    if (!cluster) {
      throw new Error('No currently active cluster')
    }

    const url = `${cluster.server}${path}?watch=true`

    const agentOpts = {}
    const requestOptions = {
      headers: { 'Content-Type': 'application/json' },
      method: 'GET',
    }

    this.kubeConfig.applytoHTTPSOptions(agentOpts)

    const agent = new Agent(agentOpts)

    const response = await fetch(url, {
      ...requestOptions,
      signal: this.signal,
      agent,
    })

    if (response.ok) {
      try {
        await new Promise((resolve, reject) => {
          const stream = byline(response.body)

          stream.on('data', (line) => {
            const data = JSON.parse(line.toString())

            onEvent(data.type, data.object, data)
          })

          stream.on('error', reject)
          stream.on('end', resolve)
        })
      } catch (error: any) {
        if (error.type !== 'aborted') {
          throw error
        }
      }
    } else if (response.status >= 400) {
      const body = await response.json()

      throw new Error(`${response.statusText}: ${url} - ${body.message || 'Watch request error'}`)
    }
  }
}
