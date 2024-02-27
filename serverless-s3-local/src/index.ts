import { start, MinioConfig, NotificationConfig, BucketConfig } from "./minio";
import { Logging } from "serverless/classes/Plugin";
import { Logger, createLogger } from "./logger";
import Serverless, { FunctionDefinitionHandler } from "serverless";
import {
  CloudFormationResource,
  S3,
} from "serverless/plugins/aws/provider/awsProvider";

type AWSS3BucketResource = Omit<CloudFormationResource, "Type"> & {
  Type: "AWS::S3::Bucket";
};

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

const getAWSS3BucketResources = (
  serverless: Serverless,
): AWSS3BucketResource[] => {
  return getResources(serverless).flatMap((resource) => {
    if (!isAWSS3BucketResource(resource)) {
      return [];
    }

    return resource;
  });
};

const getS3Events = (
  serverless: Serverless,
): { functionName: string; event: S3 }[] => {
  console.log(serverless.service.getAllFunctions());
  console.log(
    serverless.service
      .getAllFunctions()
      .map((n: string) => serverless.service.getFunction(n)),
  );
  return serverless.service
    .getAllFunctions()
    .map((n) => serverless.service.getFunction(n))
    .flatMap((func) => {
      const functionName = `${func.name}`;
      return (func.events || []).flatMap((event) => {
        if (event.s3 === undefined) {
          return [];
        }

        return { functionName, event: event.s3 };
      });
    });
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
    const notificationConfigs: NotificationConfig[] = getS3Events(
      this.serverless,
    ).map(({ functionName, event }) =>
      NotificationConfig.of(functionName, event),
    );
    const bucketConfigs: BucketConfig[] = getAWSS3BucketResources(
      this.serverless,
    ).map((resource) => ({
      Name: resource.Properties.BucketName,
      Region: "us-east-2",
    }));

    this.stopMinio = await start(
      minioConfig,
      bucketConfigs,
      notificationConfigs,
    );

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
