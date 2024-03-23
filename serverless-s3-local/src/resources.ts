// derived from https://github.com/daisuke-awaji/cloudformation-typescript-parser
import { default as Resource } from "cloudform-types/types/resource";
import { findAndReplaceIf } from "find-and-replace-anything";

const getPhysicalId = (resource: Resource) => {
  if (resource.Type === "AWS::S3::Bucket") {
    return resource.Properties?.BucketName;
  }

  throw new Error(
    `Could not get physical id for resource type ${resource.Type}`,
  );
};

export const parse = (resources: Record<string, Resource>) => {
  function filterRef(val: { Ref?: string }) {
    if (!val.Ref) {
      return val;
    }

    if (!resources[val.Ref]) {
      throw new Error(`Ref ${val.Ref} not found.`);
    }

    return getPhysicalId(resources[val.Ref]);
  }

  // biome-ignore lint/suspicious/noExplicitAny: Resource has any type
  function filterJoin(val: any) {
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
  }

  // biome-ignore lint/suspicious/noExplicitAny: Resource has any type
  function arrayProps(foundVal: any) {
    if (!Array.isArray(foundVal)) {
      return foundVal;
    }
    return foundVal.map((item) => replaceRecursively(item));
  }

  // biome-ignore lint/suspicious/noExplicitAny: Resource has any type
  function replaceRecursively(val: any) {
    let ret = val;
    ret = findAndReplaceIf(ret, filterRef);
    ret = findAndReplaceIf(ret, filterJoin);
    ret = findAndReplaceIf(ret, arrayProps);
    return ret;
  }

  return replaceRecursively(resources);
};
