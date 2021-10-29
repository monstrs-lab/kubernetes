import { AbstractCommand } from './abstract.command'

export class KubeconfigCommand extends AbstractCommand {
  async get(name: string) {
    return this.run(['kubeconfig', 'get', name])
  }
}
