import { Agent }      from 'node:https'

import { KubeConfig } from '@kubernetes/client-node'
import { Logger }     from '@monstrs/logger'

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
        for await (const chunk of response.body) {
          this.parseChunk(chunk).forEach((data) => {
            onEvent(data.type, data.object, data)
          })
        }
      } catch (error: any) {
        if (error.type !== 'aborted') {
          throw error
        }
      }
    } else if (response.status >= 400) {
      throw new Error(response.statusText)
    }
  }

  private parseChunk(chunk: Buffer): Array<any> {
    const lines: Array<string> = chunk
      .toString()
      .split(/\r\n|[\n\v\f\r\x85\u2028\u2029]/g)
      .filter(Boolean)

    const data: Array<any> = []

    lines.forEach((line) => {
      try {
        data.push(JSON.parse(line))
      } catch (error) {
        this.logger.error(error)
      }
    })

    return data
  }
}
