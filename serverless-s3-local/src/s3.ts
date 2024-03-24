import { S3 } from "serverless/plugins/aws/provider/awsProvider";
import { default as Resource } from "cloudform-types/types/resource";

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
  const is = (event: string): event is Event => {
    return events.includes(event as Event);
  };
}

export type EventHandler = {
  name: string;
  event: S3;
};

export namespace EventHandler {
  export const defaultOf = (name: string, bucket: string): EventHandler => ({
    name,
    event: {
      bucket,
      event: "s3:ObjectCreated:*",
    },
  });
}

export type Object = {
  key: string;
  sequencer: string;
  size?: number;
  eTag?: string;
};

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
      object: Object;
    };
  }[];
};

export type BucketResource = Omit<Resource, "Type" | "Properties"> & {
  Type: "AWS::S3::Bucket";
  Properties: Required<Resource>["Properties"];
};

export const isAWSS3BucketResource = (
  resource: Resource,
): resource is BucketResource => {
  return (
    resource.Type === "AWS::S3::Bucket" && resource.Properties !== undefined
  );
};

export type BucketPolicyResource = Omit<Resource, "Type" | "Properties"> & {
  Type: "AWS::S3::BucketPolicy";
  Properties: Required<Resource>["Properties"];
};

export const isAWSS3BucketPolicyResource = (
  resource: Resource,
): resource is BucketPolicyResource => {
  return resource.Type === "AWS::S3::BucketPolicy";
};
