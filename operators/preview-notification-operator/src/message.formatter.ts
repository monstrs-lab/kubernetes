export class MessageFormatter {
  formatPullRequestDeployed(name, hosts: Array<string>) {
    return `This pull request for workspace **${name}** is being automatically deployed.
                  
✅ Preview: ${hosts.map((host) => `[https://${host}](https://${host}) `)}`
  }

  formatPullRequestUndeployed(name, hosts: Array<string>) {
    return `This pull request for workspace **${name}** is being undeployed.
                  
✅ Preview: ${hosts.map((host) => `[https://${host}](https://${host}) `)}`
  }
}
