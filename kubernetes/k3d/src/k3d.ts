import { ClusterCommand }    from './cluster.command'
import { KubeconfigCommand } from './kubeconfig.command'

export class K3d {
  public readonly cluster = new ClusterCommand()

  public readonly kubeconfig = new KubeconfigCommand()
}
