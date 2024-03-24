import { BucketPolicyResource, BucketResource, EventHandler } from "./s3";
import { Logger } from "./logger";

const DEFAULT_REGION = "us-east-1";

export type WebsiteConfig = {
  Bucket: string;
  IndexDocument: string;
  ErrorDocument: string;
};

export type BucketConfig = {
  Name: string;
  Region: string;
  Website?: WebsiteConfig;
};

export namespace BucketConfig {
  export const of = (resource: BucketResource): BucketConfig => {
    return {
      Name: resource.Properties.BucketName,
      Region: resource.Properties.Region || DEFAULT_REGION,
      Website: resource.Properties.WebsiteConfiguration
        ? {
            Bucket: resource.Properties.BucketName,
            IndexDocument:
              resource.Properties.WebsiteConfiguration.IndexDocument,
            ErrorDocument:
              resource.Properties.WebsiteConfiguration.ErrorDocument,
          }
        : undefined,
    };
  };
}

export type BucketPolicy = {
  Bucket: string;
  PolicyString: string;
};

export namespace BucketPolicy {
  export const of = (resource: BucketPolicyResource): BucketPolicy => {
    return {
      Bucket: resource.Properties.Bucket,
      PolicyString: JSON.stringify({
        ...resource.Properties.PolicyDocument,
        Version: "2012-10-17",
      }),
    };
  };
}

export type StartFunc = (
  bucketConfigs: Record<string, BucketConfig>,
  bucketPolicies: BucketPolicy[],
  eventHanders: EventHandler[],
  log?: Logger,
) => Promise<() => void>;
