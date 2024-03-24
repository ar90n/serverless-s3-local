import {
  MinioConfig,
  BucketConfig,
  BucketPolicy,
  NotificationConfig,
  start as startMinio,
} from "./backend/minio";
import { Logger, nullLogger } from "./logger";
import { WebsiteConfig, startServer as startProxyServer } from "./webproxy";

const DEFAULT_PROXY_PORT = 2929;

export type StorageConfig = {
  Minio: MinioConfig;
  proxyPort?: number;
};

export namespace StorageConfig {
  // biome-ignore lint/suspicious/noExplicitAny: Custom has any type
  export const of = (config: Record<string, any>): StorageConfig => {
    return {
      Minio: MinioConfig.of(config.minio),
      proxyPort: config.proxyPort,
    };
  };
}

const spawnProxyServer = async (
  config: StorageConfig,
  websites: WebsiteConfig[],
): Promise<{ port: number; close: () => void }> => {
  const { port, close } = await startProxyServer({
    Port: config.proxyPort ?? DEFAULT_PROXY_PORT,
    TargetEndpoint: `http://${config.Minio.address}:${config.Minio.port}`,
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
  config: StorageConfig,
  bucketConfigs: Record<string, BucketConfig>,
  bucketPolicies: BucketPolicy[],
  notificationConfigs: NotificationConfig[],
  log: Logger = nullLogger,
): Promise<() => void> => {
  const closeFuncs: (() => void)[] = [];

  const closeMinio = await startMinio(
    config.Minio,
    bucketConfigs,
    bucketPolicies,
    notificationConfigs,
    log,
  );
  closeFuncs.push(closeMinio);

  const websites = collectWebsiteConfigs(bucketConfigs);
  if (0 < websites.length) {
    const { port, close } = await spawnProxyServer(config, websites);
    log.info(`Proxy server started at http://localhost:${port}`);
    closeFuncs.push(close);
  }

  return () => {
    for (const close of closeFuncs) {
      close();
    }
  };
};
