import { StartFunc } from "../storage";
import { MinioConfig, start } from "./minio";

// biome-ignore lint/suspicious/noExplicitAny: Custom has any type
export const getStartFunc = (config: Record<string, any>): StartFunc => {
  const minioConfig = MinioConfig.of(config);

  return async (
    bucketConfigs,
    bucketPolicies,
    eventHandlers,
    log,
  ): Promise<() => void> => {
    return await start(
      minioConfig,
      bucketConfigs,
      bucketPolicies,
      eventHandlers,
      log,
    );
  };
};
