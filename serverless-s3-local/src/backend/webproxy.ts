import Koa from "koa";
import proxy from "koa-proxy";

import { WebsiteConfig } from "../storage.js";

export const DEFAULT_PORT = 2929;

export type ProxyConfig = {
  Port: number;
  TargetEndpoint: string;
  Websites: WebsiteConfig[];
};

const createProxy = (config: ProxyConfig): Koa.Middleware => {
  return proxy({
    host: config.TargetEndpoint,
    map: (path) => {
      for (const website of config.Websites) {
        const pattern = new RegExp(`^/${website.Bucket}(\/.*)?$`);
        if (pattern.test(path)) {
          return `${website.Bucket}/${website.IndexDocument}`;
        }
      }
      return path;
    },
  });
};

export const startServer = async (
  config: ProxyConfig,
): Promise<{ port: number; close: () => void }> => {
  const app = new Koa();
  app.use(createProxy(config));

  const server = app.listen(config.Port);
  const address = server.address();
  if (address === null) {
    throw new Error("Server failed to start");
  }
  if (typeof address === "string") {
    throw new Error("Server started with pipe or domain socket");
  }

  return {
    port: address.port,
    close: () => server.close(),
  };
};
