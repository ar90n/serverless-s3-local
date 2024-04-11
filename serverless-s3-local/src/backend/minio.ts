import { spawn as spawnProcess } from "child_process";
import * as Minio from "minio";
import * as fs from "fs";
import * as path from "path";
import { default as stream } from "node:stream";
import type { ReadableStream } from "node:stream/web";

import { Logger, nullLogger } from "../logger.js";
import { createTempDirectory, waitFor } from "../util.js";
import {
  EventHandler,
  BucketConfig,
  BucketPolicy,
  WebsiteConfig,
} from "../storage.js";
import {
  startServer as startProxyServer,
  DEFAULT_PORT as DEFAULT_PROXY_PORT,
} from "./webproxy.js";

const MINIO_CMD = process.env.MINIO_CMD || "minio";
const MY_MINIO_LOCATION =
  process.env.MY_MINIO_LOCATION ||
  `${process.env.HOME}/.serverless-s3-local/minio`;
const DEFAULT_ADDRESS = "0.0.0.0";
const DEFAULT_PORT = 9000;
const DEFAULT_ENDPOINT = "127.0.0.1";
const DEFAULT_ACCESS_KEY = "minioadmin";
const DEFAULT_SECRET_KEY = "minioadmin";

export type MinioConfig = {
  address: string;
  port: number;
  directory: string;
  accessKey: string;
  secretKey: string;
  websiteProxyPort: number;
  fetchFromWeb: boolean;
};

export namespace MinioConfig {
  export const of = ({
    address,
    port,
    directory,
    accessKey,
    secretKey,
    websiteProxyPort,
    fetchFromWeb,
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
      fetchFromWeb: fetchFromWeb || false,
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

const isHealthy = async (address: string, port: number): Promise<boolean> => {
  try {
    const { status } = await fetch(
      `http://${address}:${port}/minio/health/live`,
    );
    if (status === 200) {
      return true;
    }
  } catch (e) {
    // ignore
  }

  return false;
};

const getMinioURL = (): string => {
  const arch = process.arch === "x64" ? "amd64" : "arm64";
  const paltform =
    process.platform === "win32"
      ? "windows"
      : process.platform === "darwin"
        ? "darwin"
        : "linux";
  return `https://dl.min.io/server/minio/release/${paltform}-${arch}/minio`;
};

const fetchFileFromWeb = async (
  url: string,
  verbose: boolean,
): Promise<stream.Readable> => {
  const { body } = await fetch(url);
  const ret = stream.Readable.fromWeb(body as ReadableStream<Uint8Array>);

  if (verbose) {
    process.stderr.write("Downloading minio...");
  }
  return ret;
};

const spawnMinio = async (
  { address, directory, port, accessKey, secretKey, fetchFromWeb }: MinioConfig,
  handlers: EventHandler[],
  log: Logger = nullLogger,
) => {
  // Download minio
  if (fetchFromWeb) {
    const minioUrl = getMinioURL();

    if (!fs.existsSync(MY_MINIO_LOCATION)) {
      log.info(`Downloading minio from ${minioUrl} to ${MY_MINIO_LOCATION}`);
      const s = await fetchFileFromWeb(minioUrl, true);
      await fs.promises.mkdir(path.dirname(MY_MINIO_LOCATION), {
        recursive: true,
      });
      const fileStream = fs.createWriteStream(MY_MINIO_LOCATION);
      await stream.promises.finished(s.pipe(fileStream));
      fs.chmodSync(MY_MINIO_LOCATION, 0o755);
    }
  }
  const minio_cmd = fetchFromWeb ? MY_MINIO_LOCATION : MINIO_CMD;

  const notifyEnv: Record<string, string> = handlers
    .map((h) => h.id)
    .reduce((acc: Record<string, string>, id: string) => {
      acc[`MINIO_NOTIFY_WEBHOOK_ENABLE_${id}`] = "on";
      acc[`MINIO_NOTIFY_WEBHOOK_ENDPOINT_${id}`] = "http://127.0.0.1";
      return acc;
    }, {});

  const env = {
    ...process.env,
    ...notifyEnv,
    MINIO_ACCESS_KEY: accessKey,
    MINIO_SECRET_KEY: secretKey,
  } as { [key: string]: string };

  const minio = spawnProcess(
    minio_cmd,
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

  await waitFor(async () => isHealthy(address, port), 1000, 120);

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

const createBucketNotificationConfig = ({
  id,
  prefix,
  suffix,
  event,
}: EventHandler): Minio.NotificationConfig => {
  const arn = Minio.buildARN("minio", "sqs", "", id, "webhook");
  const queue = new Minio.QueueConfig(arn);
  queue.addFilterPrefix(prefix);
  queue.addFilterSuffix(suffix);
  queue.addEvent(event);

  const bucketNotificationConfig = new Minio.NotificationConfig();
  bucketNotificationConfig.add(queue);

  return bucketNotificationConfig;
};

const bindEventHandler = (
  client: Minio.Client,
  handler: EventHandler,
): (() => void) => {
  const listener = client.listenBucketNotification(
    handler.bucket,
    handler.prefix,
    handler.suffix,
    [handler.event],
  );
  listener.on("notification", async (record) => {
    if (record) {
      await handler.invoke(record);
    }
  });
  return () => listener.stop();
};

export const start = async (
  config: MinioConfig,
  bucketConfigs: Record<string, BucketConfig>,
  bucketPolicies: BucketPolicy[],
  eventHandlers: EventHandler[],
  log: Logger = nullLogger,
): Promise<() => void> => {
  const closeFuncs = [] as (() => void)[];

  // Spawn Minio
  const closeMinio = await spawnMinio(config, eventHandlers, log);
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
  for (const handler of eventHandlers) {
    const bucketNotificationConfig = createBucketNotificationConfig(handler);

    // Create bucket if not exists
    await makeBucket(client, {
      Name: handler.bucket,
      Region: Minio.DEFAULT_REGION,
    });
    await client.setBucketNotification(
      handler.bucket,
      bucketNotificationConfig,
    );

    const close = bindEventHandler(client, handler);
    closeFuncs.push(close);
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
