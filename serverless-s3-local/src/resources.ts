// derived from https://github.com/daisuke-awaji/cloudformation-typescript-parser
import { default as Resource } from "cloudform-types/types/resource";
import { findAndReplaceIf } from "find-and-replace-anything";

const getPhysicalId = (resource: Resource): string => {
  if (resource.Type === "AWS::S3::Bucket") {
    return resource.Properties?.BucketName;
  }

  throw new Error(
    `Could not get physical id for resource type ${resource.Type}`,
  );
};

export const parse = (
  resources: Record<string, Resource>,
): Record<string, Resource> => {
  // biome-ignore lint/suspicious/noExplicitAny: Resource has any type
  const filterRef = (val: { Ref?: string }): any => {
    if (!val.Ref) {
      return val;
    }

    if (!resources[val.Ref]) {
      throw new Error(`Ref ${val.Ref} not found.`);
    }
    return getPhysicalId(resources[val.Ref]);
  };

  // biome-ignore lint/suspicious/noExplicitAny: Resource has any type
  const filterJoin = (val: any): any => {
    if (
      val["Fn::Join"] === undefined ||
      !val["Fn::Join"][1] ||
      !Array.isArray(val["Fn::Join"][1])
    ) {
      return val;
    }

    const separator = val["Fn::Join"][0];
    const parts = val["Fn::Join"][1];
    const replacedParts = parts.map((part) => replaceRecursively(part));
    return replacedParts.join(separator);
  };

  // biome-ignore lint/suspicious/noExplicitAny: Resource has any type
  const arrayProps = (foundVal: any): any => {
    if (!Array.isArray(foundVal)) {
      return foundVal;
    }
    return foundVal.map((item) => replaceRecursively(item));
  };

  // biome-ignore lint/suspicious/noExplicitAny: Resource has any type
  const replaceRecursively = (val: any): any => {
    let ret = val;
    ret = findAndReplaceIf(ret, filterRef);
    ret = findAndReplaceIf(ret, filterJoin);
    ret = findAndReplaceIf(ret, arrayProps);
    return ret;
  };

  return replaceRecursively(resources);
};

export type BucketResource = Omit<Resource, "Type" | "Properties"> & {
  Type: "AWS::S3::Bucket";
  Properties: Required<Resource>["Properties"];
};

export namespace BucketResource {
  export const is = (resource: Resource): resource is BucketResource => {
    return (
      resource.Type === "AWS::S3::Bucket" && resource.Properties !== undefined
    );
  };
}

export type BucketPolicyResource = Omit<Resource, "Type" | "Properties"> & {
  Type: "AWS::S3::BucketPolicy";
  Properties: Required<Resource>["Properties"];
};

export namespace BucketPolicyResource {
  export const is = (resource: Resource): resource is BucketPolicyResource => {
    return (
      resource.Type === "AWS::S3::BucketPolicy" &&
      resource.Properties !== undefined
    );
  };
}

export const extractBucketResources = (
  resources: Record<string, Resource>,
): Record<string, BucketResource> => {
  const ret: Record<string, BucketResource> = {};
  for (const [logicalId, resource] of Object.entries(resources)) {
    if (BucketResource.is(resource)) {
      ret[logicalId] = resource;
    }
  }

  return ret;
};

export const extractBucketPolicyResources = (
  resources: Record<string, Resource>,
): Record<string, BucketPolicyResource> => {
  const ret: Record<string, BucketPolicyResource> = {};
  for (const [logicalId, resource] of Object.entries(resources)) {
    if (BucketPolicyResource.is(resource)) {
      ret[logicalId] = resource;
    }
  }

  return ret;
};
