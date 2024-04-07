declare module "serverless-offline/lambda" {
  import type { default as Serverless, FunctionDefinition } from "serverless";

  export class LambdaFunction {
    // biome-ignore lint/suspicious/noExplicitAny: meet the requirements of the Logging interface
    setEvent(event: Record<string, any>): void;
    // biome-ignore lint/suspicious/noExplicitAny: meet the requirements of the Logging interface
    runHandler(): Promise<any>;
  }
  export default class Lambda {
    constructor(serverless: Serverless, options: Serverless.Options);
    create(
      lambdas: {
        functionKey: string;
        functionDefinition: FunctionDefinition;
      }[],
    ): void;
    get(functionKey: string): LambdaFunction;
  }
}
