/* eslint-disable no-console */

// TODO: move to bootstrap
import { PreviewOperator } from './preview.operator'

const operator = new PreviewOperator()

const exit = (reason: string) => {
  console.log('askdlfjlasdjf')
  console.log(reason)

  operator.stop()
  process.exit(0)
}

operator.start().catch((error) => {
  console.log(error)
  exit(error.message)
})

process.on('SIGTERM', () => exit('SIGTERM')).on('SIGINT', () => exit('SIGINT'))
