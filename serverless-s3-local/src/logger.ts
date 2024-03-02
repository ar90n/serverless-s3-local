import { Logging } from "serverless/classes/Plugin";

export type Logger = Logging["log"];
export const createLogger = (log: Logging["log"]): Logger => log;

export const nullLogger: Logger = {
  // biome-ignore lint/suspicious/noExplicitAny: meet the requirements of the Logging interface
  error: (...args: any[]) => {},
  // biome-ignore lint/suspicious/noExplicitAny: meet the requirements of the Logging interface
  warning: (...args: any[]) => {},
  // biome-ignore lint/suspicious/noExplicitAny: meet the requirements of the Logging interface
  notice: (...args: any[]) => {},
  // biome-ignore lint/suspicious/noExplicitAny: meet the requirements of the Logging interface
  info: (...args: any[]) => {},
  // biome-ignore lint/suspicious/noExplicitAny: meet the requirements of the Logging interface
  debug: (...args: any[]) => {},
  // biome-ignore lint/suspicious/noExplicitAny: meet the requirements of the Logging interface
  verbose: (...args: any[]) => {},
  // biome-ignore lint/suspicious/noExplicitAny: meet the requirements of the Logging interface
  success: (...args: any[]) => {},
};
