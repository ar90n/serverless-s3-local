import http from "http";

const handleRequest = (handler: Handler) => {
  return (
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> => {
    const endpoint = handler.endpoint || "";
    if (req.url?.startsWith(endpoint)) {
      return handler.callback(req, res).catch((err) => {
        console.error(err);
        res.statusCode = 500;
        res.end("Internal Server Error");
      });
    }

    res.statusCode = 404;
    res.end("Not Found");
    return Promise.resolve();
  };
};

const listen = (server: http.Server, port: number): Promise<void> => {
  return new Promise((resolve, reject) => {
    server.listen(port, resolve);
    server.on("error", reject);
  });
};

export type Handler = {
  endpoint?: string;
  callback: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) => Promise<void>;
};

export const startServer = async (handler: Handler) => {
  const server = http.createServer();
  server.on("request", handleRequest(handler));

  await listen(server, 0);
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
