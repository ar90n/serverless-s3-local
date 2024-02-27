import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import * as Minio from "minio";
import { Logger, nullLogger } from "./logger";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { startServer } from "./http";
import aws from "aws-sdk";
import Aws from "serverless/plugins/aws/provider/awsProvider";

const MINIO_CMD = process.env.MINIO_CMD || "minio";
const DEFAULT_HOSTNAME = "127.0.0.1";
const DEFAULT_PORT = 9000;
const DEFAULT_ENDPOINT = DEFAULT_HOSTNAME;

export type NotificationConfig = {
  id: string;
  bucketName: string;
  functionName: string;
  bucketNotificationConfig: Minio.NotificationConfig;
};

export namespace NotificationConfig {
  export const of = (
    functionName: string,
    event: string | Aws.S3,
  ): NotificationConfig => {
    if (typeof event === "string") {
      const id = Math.random().toString(36).slice(-8);
      const bucketNotification = new Minio.NotificationConfig();
      const arn = Minio.buildARN("minio", "sqs", "", id, "webhook");
      console.log(arn);
      console.log("minio", "sqs", "", id, "webhook");
      const queue = new Minio.QueueConfig(arn);
      queue.addEvent(Minio.ObjectCreatedAll);
      queue.addEvent(Minio.ObjectRemovedAll);
      bucketNotification.add(queue);

      return {
        id,
        bucketName: event,
        functionName,
        bucketNotificationConfig: bucketNotification,
      };
    }

    const bucketNotification = new Minio.NotificationConfig();
    const id = Math.random().toString(36).slice(-8);
    const arn = Minio.buildARN("minio", "sqs", "", id, "webhook");
    const queue = new Minio.QueueConfig(arn);
    for (const rule of event.rules || []) {
      if (typeof rule.prefix === "string") {
        queue.addFilterSuffix(rule.prefix);
      }
      if (typeof rule.suffix === "string") {
        queue.addFilterSuffix(rule.suffix);
      }
    }
    queue.addEvent(event.event);
    bucketNotification.add(queue);

    return {
      id,
      bucketName: event.bucket,
      functionName,
      bucketNotificationConfig: bucketNotification,
    };
  };
}

export type BucketConfig = {
  Name: string;
  Region: string;
};

export type MinioConfig = {
  hostname?: string;
  port?: number;
  directory?: string;
  log?: Logger;
};

const isMinioError = (error: any): error is MinioError => {
  if (!error) return false;

  return error.code !== undefined;
};

type MinioError = Error & { code: string };

type ValidatedMinioConfig = Required<MinioConfig>;

const createTempDirectory = (): string => {
  const tempDirectoryPrefix = path.join(os.tmpdir(), "serverless-s3-local");
  const tempDirectory = fs.mkdtempSync(tempDirectoryPrefix);
  return tempDirectory;
};

const validateMinioConfig = ({
  hostname,
  port,
  directory,
  log,
}: MinioConfig): ValidatedMinioConfig => {
  if (!directory) {
    directory = createTempDirectory();
  }

  return {
    hostname: hostname || DEFAULT_HOSTNAME,
    port: port || DEFAULT_PORT,
    directory,
    log: log || nullLogger,
  };
};

const createClient = (config: ValidatedMinioConfig): Minio.Client => {
  const client = new Minio.Client({
    endPoint: DEFAULT_ENDPOINT,
    useSSL: false,
    accessKey: "minioadmin",
    secretKey: "minioadmin",
    ...config,
  });

  return client;
};

const waitForMinio = (minio: ChildProcessWithoutNullStreams): Promise<void> => {
  return new Promise((resolve) => {
    minio.stdout.on("data", (data) => {
      console.log(new Buffer(data).toString("utf8"));
      if (data.includes("S3-API:")) {
        // Assuming this log line indicates that Minio has started
        resolve();
      }
    });
  });
};

const spawnMinio = async (
  { hostname, log, directory, port }: ValidatedMinioConfig,
  env: { [key: string]: string },
) => {
  console.log(["server", directory, "--address", `${hostname}:${port}`]);
  console.log(env);
  const minio = spawn(
    MINIO_CMD,
    ["server", directory, "--address", `${hostname}:${port}`],
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

  await waitForMinio(minio);

  return () => {
    minio.kill("SIGTERM");
  };
};

const makeBucket = (
  client: Minio.Client,
  { Name, Region }: BucketConfig,
): Promise<void> => {
  return new Promise((resolve, reject) => {
    client.makeBucket(Name, Region, (err) => {
      if (
        !err ||
        (isMinioError(err) && err.code === "BucketAlreadyOwnedByYou")
      ) {
        resolve();
        return;
      }

      reject(err);
    });
  });
};

export const start = async (
  minioConfig: MinioConfig,
  bucketConfigs: BucketConfig[],
  notificationConfigs: NotificationConfig[],
): Promise<() => void> => {
  const config = validateMinioConfig(minioConfig);
  const client = createClient(config);

  let httpPort = 12345;
  let closeServer = () => {};
  const env = { ...process.env } as { [key: string]: string };
  if (0 < notificationConfigs.length) {
    const aaaa = await startServer({
      endpoint: "",
      callback: async (req, res) => {
        console.log(req);
        for (const config of notificationConfigs) {
          if (req.url === `/${config.id}`) {
            const clientContextData = JSON.stringify({
              foo: "foo",
            });

            const payload = JSON.stringify({
              data: "foo",
            });

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

            const response = await lambda.invoke(params).promise();
            res.end();
            return;
          }
        }
      },
    });
    httpPort = aaaa.port;
    console.log(httpPort);
    for (const config of notificationConfigs) {
      console.log(`MINIO_NOTIFY_WEBHOOK_ENABLE_${config.id}`);
      env[`MINIO_NOTIFY_WEBHOOK_ENABLE_${config.id}`] = "on";
      env[`MINIO_NOTIFY_WEBHOOK_ENDPOINT_${config.id}`] =
        `http://127.0.0.1:${httpPort}/${config.id}`;
    }
    closeServer = aaaa.close;
  }

  // Spawn Minio

  const closeMinio = await spawnMinio(config, env);

  // Create each bucket
  for (const config of bucketConfigs) {
    await makeBucket(client, config);
  }

  // Set each bucket notification
  for (const { bucketName, bucketNotificationConfig } of notificationConfigs) {
    console.log(`Setting notification for ${bucketName}`);
    await client.setBucketNotification(bucketName, bucketNotificationConfig);
  }

  return () => {
    closeMinio();
    closeServer();
  };
};
