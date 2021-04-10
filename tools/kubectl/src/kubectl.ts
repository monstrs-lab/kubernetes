import { KubernetesObject }  from '@kubernetes/client-node'
import execa                 from 'execa'
import tempy                 from 'tempy'
import { promises as fs }    from 'fs'

import { resourcesToString } from '@monstrs/k8s-resource-utils'
import { Logger }            from '@monstrs/logger'

export class KubeCtl {
  private readonly logger = new Logger(KubeCtl.name)

  private async exec(
    action: 'apply' | 'delete',
    resources: Array<KubernetesObject>
  ): Promise<void> {
    const target = tempy.file({ extension: 'yaml' })

    await fs.writeFile(target, resourcesToString(resources))

    const { stdout, stderr, exitCode } = await execa('kubectl', [action, '-f', target])

    if (stderr) {
      this.logger.error(stderr)
    }

    if (stdout) {
      this.logger.info(stdout)
    }

    if (exitCode !== 0) {
      throw new Error(`Error kubectl ${action}: ${stderr}`)
    }
  }

  async apply(resources: Array<KubernetesObject>): Promise<void> {
    return this.exec('apply', resources)
  }

  async delete(resources: Array<KubernetesObject>): Promise<void> {
    return this.exec('delete', resources)
  }

  async run(args: Array<string>, options?): Promise<string> {
    const { stdout, stderr, exitCode } = await execa('kubectl', args, options)

    if (stderr) {
      this.logger.error(stderr)
    }

    if (stdout) {
      this.logger.info(stdout)
    }

    if (exitCode !== 0) {
      throw new Error(`Error kubectl ${args.join(' ')}: ${stderr}`)
    }

    return stdout
  }
}
