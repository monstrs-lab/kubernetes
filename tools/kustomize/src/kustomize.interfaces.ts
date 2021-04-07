export interface KustomizeTransformationImages {
  name: string
  newTag: string
}

export interface KustomizeTransformations {
  namePrefix?: string
  nameSuffix?: string
  commonLabels?: { [key: string]: string }
  images?: Array<KustomizeTransformationImages>
}
