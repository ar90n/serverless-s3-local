import { Logging } from "serverless/classes/Plugin";

export type Logger = Logging["log"];
export const createLogger = (log: Logging["log"]): Logger => log;
export const nullLogger: Logger = {
  error: (...args: any[]) => {},
  warning: (...args: any[]) => {},
  notice: (...args: any[]) => {},
  info: (...args: any[]) => {},
  debug: (...args: any[]) => {},
  verbose: (...args: any[]) => {},
  success: (...args: any[]) => {},
};
