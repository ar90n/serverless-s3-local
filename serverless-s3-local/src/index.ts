import {
  NotificationConfig,
  BucketConfig,
  BucketPolicy,
} from "./backend/minio";
import {
  BucketPolicyResource,
  BucketResource,
  EventHandler,
  isAWSS3BucketPolicyResource,
  isAWSS3BucketResource,
} from "./s3";
import { start, StorageConfig } from "./storage";
import { Logging } from "serverless/classes/Plugin";
import { Logger, createLogger } from "./logger";
import { parse as parseResources } from "./resources";
import Serverless from "serverless";

import { CloudFormationResource } from "serverless/plugins/aws/provider/awsProvider";
import Service from "serverless/classes/Service";

// biome-ignore lint/suspicious/noExplicitAny: Custom has any type
const getCustomConfig = (serverless: Serverless): Record<string, any> => {
  const custom = serverless.service.custom || {};
  return custom.s3Local || {};
};

const getResources = (
  serverless: Serverless,
): [string, CloudFormationResource][] => {
  const resources =
    serverless.service.resources?.Resources ??
    serverless.service.resources ??
    {};
  console.log(parseResources(resources));
  return Object.entries(parseResources(resources));
};

const getS3BucketResources = (
  serverless: Serverless,
): [string, BucketResource][] => {
  return getResources(serverless).flatMap(([logicalId, resource]) =>
    isAWSS3BucketResource(resource) ? [[logicalId, resource]] : [],
  );
};

const getS3BucketPolicies = (
  serverless: Serverless,
): [string, BucketPolicyResource][] => {
  return getResources(serverless).flatMap(([logicalId, resource]) =>
    isAWSS3BucketPolicyResource(resource) ? [[logicalId, resource]] : [],
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
  stopStorage?: () => void;
  hooks: { [key: string]: () => void };

  constructor(
    private serverless: Serverless,
    private options: Serverless.Options,
    { log }: Logging,
  ) {
    this.log = createLogger(log);
    this.stopStorage = undefined;

    this.log.info("constructor");
    this.hooks = {
      "before:offline:start": this.startHandler.bind(this),
      "after:offline:end": this.endHandler.bind(this),
    };
  }

  private async startHandler() {
    this.log.info("start handler called");

    const config = StorageConfig.of(getCustomConfig(this.serverless));
    const bucketConfigs = Object.fromEntries(
      getS3BucketResources(this.serverless).map(([logicalId, resource]) => [
        logicalId,
        BucketConfig.of(resource),
      ]),
    );
    const bucketPolicies = getS3BucketPolicies(this.serverless).map(
      ([_, resource]) => BucketPolicy.of(resource),
    );
    const notificationConfigs = getS3Handler(this.serverless).map(
      NotificationConfig.of,
    );

    this.stopStorage = await start(
      config,
      bucketConfigs,
      bucketPolicies,
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
    if (!this.stopStorage) {
      this.log.error("Minio is not running");
      return;
    }

    this.stopStorage();
    this.stopStorage = undefined;
  }
}

module.exports = ServerlessS3Local;
