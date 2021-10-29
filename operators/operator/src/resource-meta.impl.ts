import {
    KubernetesObject,
} from '@kubernetes/client-node';

export interface ResourceMeta {
    name: string;
    namespace?: string;
    id: string;
    resourceVersion: string;
    apiVersion: string;
    kind: string;
}

export class ResourceMetaImpl implements ResourceMeta {
    public static createWithId(id: string, object: KubernetesObject): ResourceMeta {
        return new ResourceMetaImpl(id, object);
    }

    public static createWithPlural(plural: string, object: KubernetesObject): ResourceMeta {
        return new ResourceMetaImpl(`${plural}.${object.apiVersion}`, object);
    }

    public id: string;
    public name: string;
    public namespace?: string;
    public resourceVersion: string;
    public apiVersion: string;
    public kind: string;

    private constructor(id: string, object: KubernetesObject) {
        if (!object.metadata?.name || !object.metadata?.resourceVersion || !object.apiVersion || !object.kind) {
            throw Error(`Malformed event object for '${id}'`);
        }
        this.id = id;
        this.name = object.metadata.name;
        this.namespace = object.metadata.namespace;
        this.resourceVersion = object.metadata.resourceVersion;
        this.apiVersion = object.apiVersion;
        this.kind = object.kind;
    }
}
