import execa from 'execa'

export abstract class AbstractCommand {
  async run(args: Array<string>) {
    const { stdout, stderr, exitCode } = await execa('k3d', args)

    if (exitCode !== 0) {
      throw new Error(stderr || stdout)
    }

    return stdout || stderr
  }
}
