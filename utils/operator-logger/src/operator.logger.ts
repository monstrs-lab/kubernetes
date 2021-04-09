import { OperatorLogger as BaseOperatorLogger } from '@dot-i/k8s-operator'
import { Logger as BaseLogger }                 from '@monstrs/logger'

export class OperatorLogger implements BaseOperatorLogger {
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
