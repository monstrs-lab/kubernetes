import { Octokit }              from '@octokit/rest'

import { NotificationProvider } from './notification-provider.intefaces'

export class GitHubNotificationProvider implements NotificationProvider {
  private readonly octokit: Octokit

  constructor(auth: string) {
    this.octokit = new Octokit({ auth })
  }

  async notify(source, context, body: string) {
    const { pathname } = new URL(source.url)
    const [, owner, repo] = pathname.split('/')

    await this.octokit.issues.createComment({
      issue_number: context.number,
      owner,
      repo,
      body,
    })
  }
}
