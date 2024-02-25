import { start, MinioConfig, NotificationConfig, BucketConfig } from "./minio";
import * as Minio from "minio";
import { Logging } from "serverless/classes/Plugin";
import { Logger, createLogger } from "./logger";
import Serverless, { FunctionDefinitionHandler } from "serverless";
import {
  CloudFormationResource,
  S3,
} from "serverless/plugins/aws/provider/awsProvider";

type AWSS3BucketResource = {
  Type: "AWS::S3::Bucket";
} & CloudFormationResource;

const isAWSS3BucketResource = (
  resource: CloudFormationResource,
): resource is AWSS3BucketResource => {
  return resource.Type === "AWS::S3::Bucket";
};

const getCustomMinoConfig = (serverless: Serverless): MinioConfig => {
  const custom = serverless.service.custom || {};
  return custom.minio || {};
};

const getResources = (serverless: Serverless): CloudFormationResource[] => {
  return Object.values(
    serverless.service.resources.Resources || serverless.service.resources,
  );
};

export default class ServerlessS3Local {
  log: Logger;
  stopMinio?: () => void;
  hooks: { [key: string]: () => void };

  constructor(
    private serverless: Serverless,
    private options: Serverless.Options,
    { log }: Logging,
  ) {
    this.log = createLogger(log);
    this.stopMinio = undefined;

    this.log.warning("constructor");
    this.hooks = {
      "before:offline:start": this.startHandler.bind(this),
      "after:offline:end": this.endHandler.bind(this),
    };
  }

  private async startHandler() {
    this.log.warning("start handler called");

    const minioConfig: MinioConfig = getCustomMinoConfig(this.serverless); // Update this as per your configuration
    const notificationConfigs: NotificationConfig[] = this.serverless.service
      .getAllFunctions()
      .filter((functionName) => {
        return this.serverless.service
          .getAllEventsInFunction(functionName)
          .some((event) => {
            return "s3" in event;
          });
      })
      .map((functionName): NotificationConfig => {
        const f = this.serverless.service.getFunction(functionName);
        const s3Event = f.events.filter((event) => {
          return "s3" in event;
        })[0].s3;
        if (!s3Event) {
          throw new Error("s3 event not found");
        }

        if (typeof s3Event === "string") {
          const bucketNotification = new Minio.NotificationConfig();
          const arn = Minio.buildARN("minio", "sqs", "", "1", "webhook");
          const queue = new Minio.QueueConfig(arn);
          queue.addEvent(Minio.ObjectCreatedAll);
          queue.addEvent(Minio.ObjectRemovedAll);
          bucketNotification.add(queue);

          return {
            bucketName: s3Event,
            bucketNotificationConfig: bucketNotification,
          };
        }

        const bucketNotification = new Minio.NotificationConfig();
        const arn = Minio.buildARN("minio", "sqs", "", "1", "webhook");
        const queue = new Minio.QueueConfig(arn);
        for (const rule of s3Event.rules || []) {
          if (typeof rule.prefix === "string") {
            queue.addFilterSuffix(rule.prefix);
          }
          if (typeof rule.suffix === "string") {
            queue.addFilterSuffix(rule.suffix);
          }
        }
        queue.addEvent(s3Event.event);
        bucketNotification.add(queue);

        return {
          bucketName: s3Event.bucket,
          bucketNotificationConfig: bucketNotification,
        };
      });

    const bucketConfigs: BucketConfig[] = getResources(this.serverless).flatMap(
      (resource) => {
        if (!isAWSS3BucketResource(resource)) {
          return [];
        }

        return {
          Name: resource.Properties.BucketName,
          Region: "us-east-1",
        };
      },
    );

    this.stopMinio = await start(
      minioConfig,
      bucketConfigs,
      notificationConfigs,
    );
    // You can call stopMinio() when you want to stop Minio

    process.on("SIGINT", this.endHandler.bind(this));
    process.on("SIGTERM", this.endHandler.bind(this));
    process.on("SIGQUIT", this.endHandler.bind(this));
    process.on("uncaughtException", this.endHandler.bind(this));
  }

  private async endHandler() {
    this.log.warning("end handler called");
    if (!this.stopMinio) {
      this.log.warning("Minio is not running");
      return;
    }

    this.stopMinio();
    this.stopMinio = undefined;
  }
}

module.exports = ServerlessS3Local;
