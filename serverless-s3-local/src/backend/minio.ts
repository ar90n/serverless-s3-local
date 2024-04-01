import {
  ChildProcessWithoutNullStreams,
  spawn as spawnProcess,
} from "child_process";
import * as Minio from "minio";
import aws from "aws-sdk";
import { S3 } from "serverless/plugins/aws/provider/awsProvider";
import { IncomingMessage, ServerResponse } from "http";

import { Logger, nullLogger } from "../logger";
import { createTempDirectory } from "../util";
import { startServer as startHttpServer } from "./webhook";
import { EventHandler } from "../s3";
import { BucketConfig, BucketPolicy, WebsiteConfig } from "../storage";
import {
  startServer as startProxyServer,
  DEFAULT_PORT as DEFAULT_PROXY_PORT,
} from "./webproxy";

const MINIO_CMD = process.env.MINIO_CMD || "minio";
const DEFAULT_ADDRESS = "127.0.0.1";
const DEFAULT_PORT = 9000;
const DEFAULT_ENDPOINT = DEFAULT_ADDRESS;
const DEFAULT_ACCESS_KEY = "minioadmin";
const DEFAULT_SECRET_KEY = "minioadmin";

export type NotificationConfig = {
  id: string;
  bucketName: string;
  functionName: string;
  bucketNotificationConfig: Minio.NotificationConfig;
};

export namespace NotificationConfig {
  const createId = (): string => {
    return Math.random().toString(36).slice(-8);
  };
  const buildWebhookARN = (id: string): string => {
    return Minio.buildARN("minio", "sqs", "", id, "webhook");
  };
  const createQueueConfig = (id: string, event: S3): Minio.QueueConfig => {
    const arn = buildWebhookARN(id);
    const queue = new Minio.QueueConfig(arn);
    for (const rule of event.rules || []) {
      if (typeof rule.prefix === "string") {
        queue.addFilterPrefix(rule.prefix);
      }
      if (typeof rule.suffix === "string") {
        queue.addFilterSuffix(rule.suffix);
      }
    }
    queue.addEvent(event.event);
    return queue;
  };
  const createBucketNotificationConfig = (queue: Minio.QueueConfig) => {
    const bucketNotification = new Minio.NotificationConfig();
    bucketNotification.add(queue);
    return bucketNotification;
  };
  export const of = ({
    name: functionName,
    event,
  }: EventHandler): NotificationConfig => {
    const id = createId();
    const queue = createQueueConfig(id, event);
    const bucketNotificationConfig = createBucketNotificationConfig(queue);

    return {
      id,
      bucketName: event.bucket,
      functionName,
      bucketNotificationConfig,
    };
  };
}

export type MinioConfig = {
  address: string;
  port: number;
  directory: string;
  accessKey: string;
  secretKey: string;
  websiteProxyPort: number;
};

export namespace MinioConfig {
  export const of = ({
    address,
    port,
    directory,
    accessKey,
    secretKey,
    websiteProxyPort,
  }: Partial<MinioConfig>): MinioConfig => {
    if (!directory) {
      directory = createTempDirectory();
    }

    return {
      address: address || DEFAULT_ADDRESS,
      port: port || DEFAULT_PORT,
      directory,
      accessKey: accessKey || DEFAULT_ACCESS_KEY,
      secretKey: secretKey || DEFAULT_SECRET_KEY,
      websiteProxyPort: websiteProxyPort || DEFAULT_PROXY_PORT,
    };
  };
}

type MinioError = Error & { code: string };
export namespace MinioError {
  // biome-ignore lint/suspicious/noExplicitAny: use for type guard
  export const is = (error: any): error is MinioError => {
    if (!error) return false;

    return error.code !== undefined;
  };
}

const waitFor = async (
  minio: ChildProcessWithoutNullStreams,
): Promise<void> => {
  while (true) {
    try {
      const { status } = await fetch("http://localhost:9000/minio/health/live");
      if (status === 200) {
        return;
      }
    } catch (e) {
      // ignore
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error("Minio server is not ready");
};

const spawnMinio = async (
  { address, directory, port, accessKey, secretKey }: MinioConfig,
  webhookEnv: { [key: string]: string },
  log: Logger = nullLogger,
) => {
  const env = {
    ...process.env,
    ...webhookEnv,
    MINIO_ACCESS_KEY: accessKey,
    MINIO_SECRET_KEY: secretKey,
  } as { [key: string]: string };

  const minio = spawnProcess(
    MINIO_CMD,
    ["server", directory, "--address", `${address}:${port}`],
    { env },
  );

  minio.stdout.on("data", (data) => {
    log.info(`stdout: ${data}`);
  });

  minio.stderr.on("data", (data) => {
    log.error(`stderr: ${data}`);
  });

  minio.on("close", (code) => {
    log.info(`child process exited with code ${code}`);
  });

  await waitFor(minio);

  return () => {
    minio.kill("SIGTERM");
  };
};

const makeBucket = (
  client: Minio.Client,
  { Name, Region }: { Name: string; Region: string },
): Promise<void> => {
  return new Promise((resolve, reject) => {
    client.makeBucket(Name, Region, (err) => {
      if (
        !err ||
        (MinioError.is(err) && err.code === "BucketAlreadyOwnedByYou")
      ) {
        resolve();
        return;
      }

      reject(err);
    });
  });
};
const createClient = (config: MinioConfig): Minio.Client => {
  const client = new Minio.Client({
    endPoint: DEFAULT_ENDPOINT,
    useSSL: false,
    ...config,
  });

  return client;
};

const createWebhookCallback = (notificationConfigs: NotificationConfig[]) => {
  return async (req: IncomingMessage, res: ServerResponse<IncomingMessage>) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", async () => {
      for (const config of notificationConfigs) {
        if (req.url === `/${config.id}`) {
          const clientContextData = JSON.stringify({});

          const payload = decodeURIComponent(body);

          const lambda = new aws.Lambda({
            apiVersion: "2015-03-31",
            endpoint: "http://localhost:3002",
            region: "us-west-2",
            accessKeyId: "fake",
            secretAccessKey: "fake",
          });
          const params = {
            ClientContext: Buffer.from(clientContextData).toString("base64"),
            FunctionName: config.functionName,
            InvocationType: "RequestResponse",
            Payload: payload,
          };

          await lambda.invoke(params).promise();
          res.end();
          return;
        }
      }
    });
  };
};

const spawnWebhookIfNeed = async (
  notificationConfigs: NotificationConfig[],
) => {
  if (notificationConfigs.length === 0) {
    return {
      close: () => {},
      env: {},
    };
  }

  const { close, port } = await startHttpServer({
    callback: createWebhookCallback(notificationConfigs),
  });

  const env = {} as { [key: string]: string };
  for (const { id } of notificationConfigs) {
    env[`MINIO_NOTIFY_WEBHOOK_ENABLE_${id}`] = "on";
    env[`MINIO_NOTIFY_WEBHOOK_ENDPOINT_${id}`] =
      `http://127.0.0.1:${port}/${id}`;
  }

  return { close, env };
};

const spawnProxyServer = async (
  config: MinioConfig,
  websites: WebsiteConfig[],
): Promise<{ port: number; close: () => void }> => {
  const { port, close } = await startProxyServer({
    Port: config.websiteProxyPort ?? DEFAULT_PROXY_PORT,
    TargetEndpoint: `http://${config.address}:${config.port}`,
    Websites: websites,
  });

  return { port, close };
};

const collectWebsiteConfigs = (
  configs: Record<string, BucketConfig>,
): WebsiteConfig[] => {
  return Object.values(configs).flatMap((config) => {
    if (config.Website) {
      return [config.Website];
    }
    return [];
  });
};

export const start = async (
  config: MinioConfig,
  bucketConfigs: Record<string, BucketConfig>,
  bucketPolicies: BucketPolicy[],
  eventHanders: EventHandler[],
  log: Logger = nullLogger,
): Promise<() => void> => {
  const closeFuncs = [] as (() => void)[];

  const notificationConfigs = eventHanders.map(NotificationConfig.of);
  const { close: closeWebhook, env } =
    await spawnWebhookIfNeed(notificationConfigs);
  closeFuncs.push(closeWebhook);

  // Spawn Minio
  const closeMinio = await spawnMinio(config, env, log);
  const client = createClient(config);
  closeFuncs.push(closeMinio);

  // Create buckets
  for (const config of Object.values(bucketConfigs)) {
    await makeBucket(client, config);
  }

  // Set bucket policy
  for (const { Bucket, PolicyString } of bucketPolicies) {
    await client.setBucketPolicy(Bucket, PolicyString);
  }

  // Set bucket notification
  for (const { bucketName, bucketNotificationConfig } of notificationConfigs) {
    // Create bucket if not exists
    await makeBucket(client, {
      Name: bucketName,
      Region: Minio.DEFAULT_REGION,
    });
    await client.setBucketNotification(bucketName, bucketNotificationConfig);
  }

  const websites = collectWebsiteConfigs(bucketConfigs);
  if (0 < websites.length) {
    const { port, close } = await spawnProxyServer(config, websites);
    log.info(`Proxy server started at http://localhost:${port}`);
    closeFuncs.push(close);
  }

  return () => {
    for (const close of closeFuncs.reverse()) {
      close();
    }
  };
};
