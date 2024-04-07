import { BucketPolicyResource, BucketResource } from "./resources.js";
import { Logger } from "./logger.js";
import { S3 } from "serverless/plugins/aws/provider/awsProvider";
import { generateRandomString } from "./util.js";

export const DEFAULT_REGION = "us-east-1";

export const events = [
  "s3:ObjectCreated:*",
  "s3:ObjectCreated:Put",
  "s3:ObjectCreated:Post",
  "s3:ObjectCreated:Copy",
  "s3:ObjectCreated:CompleteMultipartUpload",
  "s3:ObjectRemoved:*",
  "s3:ObjectRemoved:Delete",
  "s3:ObjectRemoved:DeleteMarkerCreated",
  "s3:ReducedRedundancyLostObject",
  "s3:TestEvent",
  "s3:ObjectRestore:Post",
  "s3:ObjectRestore:Completed",
  "s3:Replication:OperationFailedReplication",
  "s3:Replication:OperationMissedThreshold",
  "s3:Replication:OperationReplicatedAfterThreshold",
  "s3:Replication:OperationNotTracked",
] as const;

export type Event = (typeof events)[number];
export namespace Event {
  export const is = (event: string): event is Event => {
    return events.includes(event as Event);
  };
}

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

export type EventPayload = {
  Records: {
    eventVersion: string;
    eventSource: string;
    awsRegion: string;
    eventTime: string;
    eventName: string;
    userIdentity: {
      principalId: string;
    };
    requestParameters: {
      sourceIPAddress: string;
    };
    responseElements: {
      "x-amz-request-id": string;
      "x-amz-id-2": string;
    };
    s3: {
      s3SchemaVersion: string;
      configurationId: string;
      bucket: {
        name: string;
        ownerIdentity: {
          principalId: string;
        };
        arn: string;
      };
      object: {
        key: string;
        sequencer: string;
        size?: number;
        eTag?: string;
      };
    };
  }[];
};

export type EventHandler = {
  id: string;
  bucket: string;
  prefix: string;
  suffix: string;
  event: Event;
  invoke: (event: EventPayload) => Promise<void>;
};

export namespace EventHandler {
  export const of = (
    resource: S3 | string,
    handler: (event: EventPayload) => Promise<void>,
  ): EventHandler => {
    const id = generateRandomString();
    if (typeof resource === "string") {
      return {
        id,
        bucket: resource,
        prefix: "*",
        suffix: "*",
        event: "s3:ObjectCreated:*",
        invoke: handler,
      };
    }
    if (!Event.is(resource.event)) {
      throw new Error(`Invalid event: ${resource.event}`);
    }

    let prefix = "*";
    let suffix = "*";
    for (const rule of resource.rules || []) {
      if (typeof rule.prefix === "string") {
        prefix = rule.prefix;
      }
      if (typeof rule.suffix === "string") {
        suffix = rule.suffix;
      }
    }

    return {
      id,
      bucket: resource.bucket,
      prefix,
      suffix,
      event: resource.event,
      invoke: handler,
    };
  };
}

export type StartFunc = (
  bucketConfigs: Record<string, BucketConfig>,
  bucketPolicies: BucketPolicy[],
  eventHanders: EventHandler[],
  log?: Logger,
) => Promise<() => void>;
