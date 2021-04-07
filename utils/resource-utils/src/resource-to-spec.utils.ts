export const isObject = (variable) => Object.prototype.toString.call(variable) === '[object Object]'

const omitKeys = (target = {}, keys: string[] = []) =>
  Object.keys(target).reduce((result, key) => {
    if (keys.includes(key)) {
      return result
    }

    return {
      ...result,
      [key]: target[key],
    }
  }, {})

const allowedKeys = (target = {}, keys: string[] = []) =>
  Object.keys(target).reduce((result, key) => {
    if (!keys.includes(key)) {
      return result
    }

    return {
      ...result,
      [key]: target[key],
    }
  }, {})

const excludeKubernetesIoAnnotations = (target) =>
  Object.keys(target).reduce((result, key) => {
    if (key.includes('kubernetes.io')) {
      return result
    }

    return {
      ...result,
      [key]: target[key],
    }
  }, {})

export const cleanEmptyFields = (resource) =>
  Object.keys(resource).reduce((result, key) => {
    if (resource[key] === undefined) {
      return result
    }

    if (Array.isArray(resource[key])) {
      return {
        ...result,
        [key]: resource[key].map((nested) =>
          isObject(nested) ? cleanEmptyFields(nested) : nested
        ),
      }
    }

    if (isObject(resource[key])) {
      return {
        ...result,
        [key]: cleanEmptyFields(resource[key]),
      }
    }

    return {
      ...result,
      [key]: resource[key],
    }
  }, {})

export const serviceResourceToSpec = (resource) =>
  cleanEmptyFields({
    ...omitKeys(resource, ['status']),
    metadata: allowedKeys(
      {
        ...resource.metadata,
        annotations: excludeKubernetesIoAnnotations(resource.metadata.annotations),
      },
      ['name', 'namespace', 'labels', 'annotations']
    ),
    spec: omitKeys(resource.spec, ['clusterIP']),
  })

export const deploymentResourceToSpec = (resource) =>
  cleanEmptyFields({
    ...omitKeys(resource, ['status']),
    metadata: allowedKeys(
      {
        ...resource.metadata,
        annotations: excludeKubernetesIoAnnotations(resource.metadata.annotations),
      },
      ['name', 'namespace', 'labels', 'annotations']
    ),
    spec: omitKeys(resource.spec, ['clusterIP']),
  })
