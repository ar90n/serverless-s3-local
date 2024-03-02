import { start, MinioConfig, NotificationConfig, BucketConfig } from "./minio";
import { BucketResource, EventHandler, isAWSS3BucketResource } from "./s3";
import { Logging } from "serverless/classes/Plugin";
import { Logger, createLogger } from "./logger";
import Serverless from "serverless";

import { CloudFormationResource } from "serverless/plugins/aws/provider/awsProvider";
import Service from "serverless/classes/Service";

const getCustomConfig = (serverless: Serverless): Service.Custom => {
  const custom = serverless.service.custom || {};
  return custom.minio || {};
};

const getResources = (serverless: Serverless): CloudFormationResource[] => {
  return Object.values(
    serverless.service.resources?.Resources ??
      serverless.service.resources ??
      [],
  );
};

const getS3BucketResources = (serverless: Serverless): BucketResource[] => {
  return getResources(serverless).flatMap((resource) =>
    isAWSS3BucketResource(resource) ? resource : [],
  );
};

const getS3Handler = (serverless: Serverless): EventHandler[] => {
  return serverless.service
    .getAllFunctions()
    .map((n) => serverless.service.getFunction(n))
    .flatMap((func) => {
      const name = `${func.name}`;
      return (func.events || []).flatMap((event) => {
        if (event.s3 === undefined) {
          return [];
        }

        if (typeof event.s3 === "string") {
          return EventHandler.defaultOf(name, event.s3);
        }

        return { name, event: event.s3 };
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

    this.log.info("constructor");
    this.hooks = {
      "before:offline:start": this.startHandler.bind(this),
      "after:offline:end": this.endHandler.bind(this),
    };
  }

  private async startHandler() {
    this.log.info("start handler called");

    const minioConfig = MinioConfig.of(getCustomConfig(this.serverless));
    const bucketConfigs = getS3BucketResources(this.serverless).map(
      BucketConfig.of,
    );
    const notificationConfigs = getS3Handler(this.serverless).map(
      NotificationConfig.of,
    );

    this.stopMinio = await start(
      minioConfig,
      bucketConfigs,
      notificationConfigs,
      this.log,
    );

    process.on("SIGINT", this.endHandler.bind(this));
    process.on("SIGTERM", this.endHandler.bind(this));
    process.on("SIGQUIT", this.endHandler.bind(this));
    process.on("uncaughtException", this.endHandler.bind(this));
  }

  private async endHandler() {
    this.log.info("end handler called");
    if (!this.stopMinio) {
      this.log.error("Minio is not running");
      return;
    }

    this.stopMinio();
    this.stopMinio = undefined;
  }
}

module.exports = ServerlessS3Local;
