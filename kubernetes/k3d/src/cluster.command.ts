import { AbstractCommand } from './abstract.command'

export class ClusterCommand extends AbstractCommand {
  async create(name: string) {
    return this.run(['cluster', 'create', name])
  }

  async delete(name: string) {
    return this.run(['cluster', 'delete', name])
  }

  async start(name: string) {
    return this.run(['cluster', 'start', name])
  }

  async stop(name: string) {
    return this.run(['cluster', 'stop', name])
  }

  async list() {
    try {
      const clusters = await this.run(['cluster', 'list', '-o', 'json'])

      return JSON.parse(clusters)
    } catch {
      return undefined
    }
  }

  async get(name: string) {
    try {
      const cluster = await this.run(['cluster', 'get', name, '-o', 'json'])

      return JSON.parse(cluster)[0]
    } catch {
      return undefined
    }
  }
}
