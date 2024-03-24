import Serverless from "serverless";
import { Logging } from "serverless/classes/Plugin";
import { default as Resource } from "cloudform-types/types/resource";

import {
  BucketPolicyResource,
  BucketResource,
  EventHandler,
  isAWSS3BucketPolicyResource,
  isAWSS3BucketResource,
} from "./s3";
import { BucketConfig, BucketPolicy, StartFunc } from "./storage";
import { Logger, createLogger } from "./logger";
import { parse as parseResources } from "./resources";
import { start as startMinioStorage, MinioConfig } from "./backend/minio";

// biome-ignore lint/suspicious/noExplicitAny: Custom has any type
const getCustomConfig = (serverless: Serverless): Record<string, any> => {
  const custom = serverless.service.custom || {};
  return custom.s3Local || {};
};

const getResources = (serverless: Serverless): [string, Resource][] => {
  const resources =
    serverless.service.resources?.Resources ??
    serverless.service.resources ??
    {};
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

const getStartFunc = (serverless: Serverless): StartFunc => {
  const config = MinioConfig.of(getCustomConfig(serverless));

  return async (
    bucketConfigs,
    bucketPolicies,
    eventHandlers,
    log,
  ): Promise<() => void> => {
    return await startMinioStorage(
      config,
      bucketConfigs,
      bucketPolicies,
      eventHandlers,
      log,
    );
  };
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

    const bucketConfigs = Object.fromEntries(
      getS3BucketResources(this.serverless).map(([logicalId, resource]) => [
        logicalId,
        BucketConfig.of(resource),
      ]),
    );
    const bucketPolicies = getS3BucketPolicies(this.serverless).map(
      ([_, resource]) => BucketPolicy.of(resource),
    );
    const eventHandlers = getS3Handler(this.serverless);

    const start = getStartFunc(this.serverless);
    this.stopStorage = await start(
      bucketConfigs,
      bucketPolicies,
      eventHandlers,
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
