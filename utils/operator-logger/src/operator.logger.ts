import { OperatorLogger }       from '@dot-i/k8s-operator'
import { Logger as BaseLogger } from '@monstrs/logger'

export class Logger implements OperatorLogger {
  private readonly logger: BaseLogger

  constructor(scope) {
    this.logger = new BaseLogger(scope)
  }

  info(message: string) {
    this.logger.info(message)
  }

  debug(message: string) {
    this.logger.debug(message)
  }

  warn(message: string) {
    this.logger.warn(message)
  }

  error(message: string) {
    this.logger.error(message)
  }
}
