export class MessageFormatter {
  formatPullRequestDeployed(name, host) {
    return `This pull request for workspace **${name}** is being automatically deployed.
                  
✅ Preview: [https://${host}](https://${host})`
  }

  formatPullRequestUndeployed(name, host) {
    return `This pull request for workspace **${name}** is being undeployed.
                  
✅ Preview: [https://${host}](https://${host})`
  }
}
