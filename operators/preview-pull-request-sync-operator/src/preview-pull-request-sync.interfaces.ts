export interface PreviewPullRequestSyncOperatorScheduleOptions {
  interval: number
}
export interface PreviewPullRequestSyncOperatorOptions {
  token: string
  schedule?: PreviewPullRequestSyncOperatorScheduleOptions
}
