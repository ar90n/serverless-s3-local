import {
  ChildProcessWithoutNullStreams,
  spawn as spawnProcess,
} from "child_process";
import * as Minio from "minio";
import { Logger, nullLogger } from "./logger";
import { createTempDirectory } from "./util";
import { startServer as startHttpServer } from "./webhook";
import aws from "aws-sdk";
import { BucketPolicyResource, BucketResource, EventHandler } from "./s3";
import Aws from "serverless/plugins/aws/provider/awsProvider";
import { IncomingMessage, ServerResponse } from "http";

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
  const createQueueConfig = (id: string, event: Aws.S3): Minio.QueueConfig => {
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

export type BucketConfig = {
  Name: string;
  Region: string;
};

export namespace BucketConfig {
  export const of = (resource: BucketResource): BucketConfig => {
    return {
      Name: resource.Properties.BucketName,
      Region: resource.Properties.Region || Minio.DEFAULT_REGION,
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

export type MinioConfig = {
  address: string;
  port: number;
  directory: string;
  accessKey: string;
  secretKey: string;
};

export namespace MinioConfig {
  export const of = ({
    address,
    port,
    directory,
    accessKey,
    secretKey,
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

const waitFor = (minio: ChildProcessWithoutNullStreams): Promise<void> => {
  return new Promise((resolve) => {
    minio.stdout.on("data", (data) => {
      if (data.includes("S3-API:")) {
        // Assuming this log line indicates that Minio has started
        resolve();
      }
    });
  });
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

export const start = async (
  minioConfig: MinioConfig,
  bucketConfigs: Record<string, BucketConfig>,
  bucketPolicies: BucketPolicy[],
  notificationConfigs: NotificationConfig[],
  log: Logger = nullLogger,
): Promise<() => void> => {
  const { close: closeWebhook, env } =
    await spawnWebhookIfNeed(notificationConfigs);

  // Spawn Minio
  const closeMinio = await spawnMinio(minioConfig, env, log);
  const client = createClient(minioConfig);

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

  return () => {
    closeMinio();
    closeWebhook();
  };
};
