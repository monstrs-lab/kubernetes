export const getResourceApiUri = (
  group: string,
  version: string,
  plural: string,
  namespace?: string
): string => {
  let uri = group ? `/apis/${group}/${version}/` : `/api/${version}/`

  if (namespace) {
    uri += `namespaces/${namespace}/`
  }

  uri += plural

  return uri
}

export const getCustomResourceApiUri = (
  group: string,
  version: string,
  plural: string,
  namespace?: string
): string => {
  let path = group ? `/apis/${group}/${version}/` : `/api/${version}/`

  if (namespace) {
    path += `namespaces/${namespace}/`
  }

  path += plural

  return path
}
