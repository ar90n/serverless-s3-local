import {
  MinioConfig,
  BucketConfig,
  BucketPolicy,
  NotificationConfig,
  start as startMinio,
} from "./backend/minio";
import { Logger, nullLogger } from "./logger";
import { startServer as startProxyServer } from "./webproxy";

export type StorageConfig = {
  Minio: MinioConfig;
  proxyPort?: number;
};

export const start = async (
  config: StorageConfig,
  bucketConfigs: Record<string, BucketConfig>,
  bucketPolicies: BucketPolicy[],
  notificationConfigs: NotificationConfig[],
  log: Logger = nullLogger,
): Promise<() => void> => {
  const close = await startMinio(
    config.Minio,
    bucketConfigs,
    bucketPolicies,
    notificationConfigs,
    log,
  );

  const websites = Object.values(bucketConfigs).flatMap((config) => {
    if (config.Website) {
      return [config.Website];
    }
    return [];
  });
  const { close: closeProxy } = await startProxyServer({
    Port: config.proxyPort ?? 2929,
    TargetEndpoint: `http://${config.Minio.address}:${config.Minio.port}`,
    Websites: websites,
  });

  return () => {
    closeProxy();
    close();
  };
};
