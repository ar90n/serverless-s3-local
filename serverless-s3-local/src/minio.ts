import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import * as Minio from "minio";
import { Logger, nullLogger } from "./logger";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { startServer } from "./http";
import aws from "aws-sdk";

const MINIO_CMD = process.env.MINIO_CMD || "minio";
const DEFAULT_HOSTNAME = "127.0.0.1";
const DEFAULT_PORT = 9000;
const DEFAULT_ENDPOINT = DEFAULT_HOSTNAME;

export type NotificationConfig = {
  bucketName: string;
  bucketNotificationConfig: Minio.NotificationConfig;
};

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
      console.log("----");
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
  httpPort: number,
) => {
  console.log("===================");
  console.log(["server", directory, "--address", `${hostname}:${port}`]);
  console.log("===================");

  const minio = spawn(
    MINIO_CMD,
    ["server", directory, "--address", `${hostname}:${port}`],
    {
      env: {
        ...process.env,
        MINIO_NOTIFY_WEBHOOK_ENABLE_1: "on",
        MINIO_NOTIFY_WEBHOOK_ENDPOINT_1: `http://127.0.0.1:${httpPort}/aiueo`,
      },
    },
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
  if (0 < notificationConfigs.length) {
    const aaaa = await startServer({
      endpoint: "/aiueo",
      callback: async (req, res) => {
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
          accessKeyId: "",
          secretAccessKey: "",
        });
        const params = {
          ClientContext: Buffer.from(clientContextData).toString("base64"),
          // FunctionName is composed of: service name - stage - function name, e.g.
          FunctionName: "serverless-s3-local-example-dev-s3hook",
          InvocationType: "RequestResponse",
          Payload: payload,
        };

        const response = await lambda.invoke(params).promise();
        console.log(response);

        console.log(req);
        res.end();
      },
    });
    httpPort = aaaa.port;
    closeServer = aaaa.close;
  }

  // Spawn Minio
  const closeMinio = await spawnMinio(config, httpPort);

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
