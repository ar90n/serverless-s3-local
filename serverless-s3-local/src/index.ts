import Serverless, { FunctionDefinition } from "serverless";
import { Logging } from "serverless/classes/Plugin";
import { default as Resource } from "cloudform-types/types/resource";

import {
  EventPayload,
  EventHandler,
  BucketConfig,
  BucketPolicy,
} from "./storage.js";
import { Logger, createLogger } from "./logger.js";
import {
  extractBucketPolicyResources,
  extractBucketResources,
  parse as parseResources,
} from "./resources.js";
import { getStartFunc } from "./backend/index.js";

// biome-ignore lint/suspicious/noExplicitAny: Custom has any type
const getCustomConfig = (serverless: Serverless): Record<string, any> => {
  const custom = serverless.service.custom || {};
  return custom.s3Local || {};
};

const getResources = (serverless: Serverless): Record<string, Resource> => {
  const resources =
    serverless.service.resources?.Resources ??
    serverless.service.resources ??
    {};
  return parseResources(resources);
};

const getBucketConfigs = (
  serverless: Serverless,
): Record<string, BucketConfig> => {
  const bucketResources = extractBucketResources(getResources(serverless));
  return Object.entries(bucketResources).reduce(
    (acc: Record<string, BucketConfig>, [logicalId, resource]) => {
      acc[logicalId] = BucketConfig.of(resource);
      return acc;
    },
    {},
  );
};

const getBucketPolicies = (serverless: Serverless): BucketPolicy[] => {
  const bucketPolicyResources = extractBucketPolicyResources(
    getResources(serverless),
  );

  return Object.entries(bucketPolicyResources).map(([_, resource]) =>
    BucketPolicy.of(resource),
  );
};

const getEventHandlers = async (
  serverless: Serverless,
  options: Serverless.Options,
): Promise<EventHandler[]> => {
  const { default: Lambda } = await import("serverless-offline/lambda");
  const lambda = new Lambda(serverless, options);

  return serverless.service
    .getAllFunctions()
    .map((n) => serverless.service.getFunction(n))
    .flatMap((func: FunctionDefinition) => {
      const name = `${func.name}`;
      lambda.create([{ functionKey: name, functionDefinition: func }]);

      const handler = async (event: EventPayload) => {
        const f = lambda.get(name);
        f.setEvent({ Records: [event] });
        await f.runHandler();
      };
      return (func.events || []).flatMap((event) => {
        if (!event.s3) {
          return [];
        }
        return EventHandler.of(event.s3, handler);
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

    const bucketConfigs = getBucketConfigs(this.serverless);
    const bucketPolicies = getBucketPolicies(this.serverless);
    const eventHandlers = await getEventHandlers(this.serverless, this.options);

    const start = getStartFunc(getCustomConfig(this.serverless));
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
