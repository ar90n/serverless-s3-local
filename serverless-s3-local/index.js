const S3rver = require("s3rver");
const fs = require("fs-extra"); // Using fs-extra to ensure destination directory exist
const shell = require("shelljs");
const path = require("path");
const { fromEvent } = require("rxjs");
const { map, mergeMap } = require("rxjs/operators");
const { default: Lambda } = require("serverless-offline/dist/lambda/");

const defaultOptions = {
  port: 4569,
  address: "localhost",
  location: ".",
  accessKeyId: "S3RVER",
  secretAccessKey: "S3RVER",
};

const removeBucket = ({ bucket, port }) =>
  new Promise((resolve, reject) => {
    shell.exec(
      `aws --endpoint http://localhost:${port} s3 rb "s3://${bucket}" --force`,
      { silent: true },
      (code, stdout, stderr) => {
        if (code === 0) return resolve();
        if (stderr && stderr.indexOf("NoSuchBucket") !== -1) return resolve();

        return reject(
          new Error(`failed to delete bucket ${bucket}: ${stderr || stdout}`)
        );
      }
    );
  });

class ServerlessS3Local {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.service = serverless.service;
    this.options = options;
    this.provider = "aws";
    this.client = null;

    this.commands = {
      s3: {
        commands: {
          start: {
            usage: "Start S3 local server.",
            lifecycleEvents: ["startHandler"],
            options: {
              port: {
                shortcut: "p",
                usage:
                  "The port number that S3 will use to communicate with your application. If you do not specify this option, the default port is 4569",
                type: "string",
              },
              directory: {
                shortcut: "d",
                usage:
                  "The directory where S3 will store its objects. If you do not specify this option, the file will be written to the current directory.",
                type: "string",
              },
              buckets: {
                shortcut: "b",
                usage: "After starting S3 local, create specified buckets",
                type: "string",
              },
              cors: {
                shortcut: "c",
                usage: "Path to cors configuration xml",
                type: "string",
              },
              noStart: {
                shortcut: "n",
                default: false,
                usage: "Do not start S3 local (in case it is already running)",
                type: "boolean",
              },
              allowMismatchedSignatures: {
                shortcut: "a",
                default: false,
                usage:
                  "Prevent SignatureDoesNotMatch errors for all well-formed signatures",
                type: "boolean",
              },
              website: {
                shortcut: "w",
                usage: "Path to website configuration xml",
                type: "string",
              },
              serviceEndpoint: {
                shortcut: "s",
                usage:
                  "Override the AWS service root for subdomain-style access",
                type: "string",
              },
              httpsProtocol: {
                shortcut: "H",
                usage:
                  "To enable HTTPS, specify directory (relative to your cwd, typically your project dir) for both cert.pem and key.pem files.",
                type: "string",
              },
              vhostBuckets: {
                shortcut: "v",
                default: true,
                usage: "Disable vhost-style access for all buckets",
                type: "string",
              },
            },
          },
          create: {
            usage: "Create local S3 buckets.",
            lifecycleEvents: ["createHandler"],
            options: {
              port: {
                shortcut: "p",
                usage:
                  "The port number that S3 will use to communicate with your application. If you do not specify this option, the default port is 4569",
                type: "string",
              },
              buckets: {
                shortcut: "b",
                usage: "After starting S3 local, create specified buckets",
                type: "string",
              },
            },
          },
          remove: {
            usage: "Remove local S3 buckets.",
            lifecycleEvents: ["createHandler"],
            options: {
              port: {
                shortcut: "p",
                usage:
                  "The port number that S3 will use to communicate with your application. If you do not specify this option, the default port is 4569",
                type: "string",
              },
              buckets: {
                shortcut: "b",
                usage: "After starting S3 local, create specified buckets",
                type: "string",
              },
            },
          },
        },
      },
    };

    this.hooks = {
      "s3:start:startHandler": this.startHandler.bind(this),
      "s3:create:createHandler": this.createHandler.bind(this),
      "s3:remove:createHandler": this.removeHandler.bind(this),
      "before:offline:start:init": this.startHandler.bind(this),
      "before:offline:start": this.startHandler.bind(this),
      "before:offline:start:end": this.endHandler.bind(this),
      "after:webpack:compile:watch:compile":
        this.subscriptionWebpackHandler.bind(this),
    };
  }

  subscriptionWebpackHandler() {
    return new Promise((resolve) => {
      if (!this.s3eventSubscription) {
        resolve();
      }

      this.s3eventSubscription.unsubscribe();

      this.subscribe();
      this.serverless.cli.log("constructor");
      resolve();
    });
  }

  subscribe() {
    this.eventHandlers = this.getEventHandlers();

    const s3Event = fromEvent(this.client, "event");

    this.s3eventSubscription = s3Event
      .pipe(
        map((event) => {
          const bucketName = event.Records[0].s3.bucket.name;
          const { eventName } = event.Records[0];
          const { key } = event.Records[0].s3.object;

          return this.eventHandlers
            .filter((handler) => handler.name === bucketName)
            .filter((handler) => eventName.match(handler.pattern) !== null)
            .filter((handler) => {
              const obj = handler.rules.reduce(
                (acc, rule) => {
                  if (!acc.prefix && rule.prefix) {
                    acc.prefix = key.match(rule.prefix);
                  } else if (!acc.suffix && rule.suffix) {
                    acc.suffix = key.match(rule.suffix);
                  }
                  return acc;
                },
                {
                  prefix: !handler.rules.some((rule) => rule.prefix),
                  suffix: !handler.rules.some((rule) => rule.suffix),
                }
              );
              return obj.prefix && obj.suffix;
            })
            .map((handler) => () => handler.func(event));
        }),
        mergeMap((handler) => handler)
      )
      .subscribe((handler) => {
        handler();
      });
  }

  startHandler() {
    return new Promise((resolve, reject) => {
      this.setOptions();
      const {
        noStart,
        address,
        port,
        cors,
        website,
        allowMismatchedSignatures,
        serviceEndpoint,
        httpsProtocol,
        vhostBuckets,
      } = this.options;
      if (noStart) {
        this.createBuckets().then(resolve, reject);
        return;
      }

      const dirPath = this.options.directory || "./buckets";
      fs.ensureDirSync(dirPath); // Create destination directory if not exist
      const directory = fs.realpathSync(dirPath);

      const configs = [
        cors
          ? fs.readFileSync(
              path.resolve(this.serverless.config.servicePath, cors),
              "utf8"
            )
          : null,
        website
          ? fs.readFileSync(
              path.resolve(this.serverless.config.servicePath, website),
              "utf8"
            )
          : null,
      ].filter((x) => !!x);

      const configureBuckets = this.buckets().map((name) => {
        if (typeof name === "object") {
          // Fn::Sub, Fn::Join, Fn::Select
          const awsFuncKey = Object.keys(name)[0];
          return { name: name[awsFuncKey], configs };
        }
        return { name, configs };
      });

      let cert;
      let key;
      if (typeof httpsProtocol === "string" && httpsProtocol.length > 0) {
        cert = fs.readFileSync(
          path.resolve(httpsProtocol, "cert.pem"),
          "ascii"
        );
        key = fs.readFileSync(path.resolve(httpsProtocol, "key.pem"), "ascii");
      }
      this.client = new S3rver({
        address,
        port,
        silent: this.options.silent,
        directory,
        allowMismatchedSignatures,
        configureBuckets,
        serviceEndpoint,
        cert,
        key,
        vhostBuckets,
      }).run(
        (err, { port: bindedPort, family, address: bindedAddress } = {}) => {
          if (err) {
            this.serverless.cli.log("Error occurred while starting S3 local.");
            reject(err);
            return;
          }

          this.options.port = bindedPort;
          this.serverless.cli.log(
            `S3 local started ( port:${bindedPort}, family: ${family}, address: ${bindedAddress} )`
          );

          resolve();
        }
      );
      this.serverless.cli.log("starting handler");
      this.subscribe();
    });
  }

  endHandler() {
    if (!this.options.noStart) {
      this.client.close();
      this.serverless.cli.log("S3 local closed");
    }
  }

  createHandler() {
    this.setOptions();
    return this.createBuckets();
  }

  removeHandler() {
    this.setOptions();
    return this.removeBuckets();
  }

  createBuckets() {
    const buckets = this.buckets();
    if (!buckets.length) {
      this.serverless.cli.log("WARN: No buckets found to create");
      return Promise.resolve([]);
    }

    const { CreateBucketCommand } = require("@aws-sdk/client-s3")
    const s3Client = this.getClient();
    return Promise.all(
      buckets.map((Bucket) => {
        this.serverless.cli.log(`creating bucket: ${Bucket}`);
        const command = new CreateBucketCommand({ Bucket });
        return s3Client.send(command);
      })
    ).catch(() => ({}));
  }

  removeBuckets() {
    return Promise.resolve().then(() => {
      const { port } = this.options;
      const buckets = this.buckets();
      if (!buckets.length) return null;

      return Promise.all(
        buckets.map((bucket) => {
          this.serverless.cli.log(`removing bucket: ${bucket}`);
          return removeBucket({ port, bucket });
        })
      );
    });
  }

  getClient() {
    const { S3Client } = require("@aws-sdk/client-s3");
    return new S3Client({
      forcePathStyle: true,
      endpoint: `http://${this.options.host}:${this.options.port}`,
      credentials: {
        accessKeyId: this.options.accessKeyId,
        secretAccessKey: this.options.secretAccessKey,
      },
    });
  }

  getServiceRuntime() {
    // Following codes are derived from serverless/index.js
    let serviceRuntime = this.service.provider.runtime;

    if (!serviceRuntime) {
      throw new Error('Missing required property "runtime" for provider.');
    }

    if (typeof serviceRuntime !== "string") {
      throw new Error(
        'Provider configuration property "runtime" wasn\'t a string.'
      );
    }

    if (serviceRuntime === "provided") {
      if (this.options.providedRuntime) {
        serviceRuntime = this.options.providedRuntime;
      } else {
        throw new Error(
          'Runtime "provided" is unsupported. Please add a --providedRuntime CLI option.'
        );
      }
    }

    if (
      !(
        serviceRuntime.startsWith("nodejs") ||
        serviceRuntime.startsWith("python") ||
        serviceRuntime.startsWith("ruby")
      )
    ) {
      this.serverless.cli.log(
        `Warning: found unsupported runtime '${serviceRuntime}'`
      );

      return null;
    }

    return serviceRuntime;
  }

  getEventHandlers() {
    if (
      typeof this.service !== "object" ||
      typeof this.service.functions !== "object"
    ) {
      return {};
    }

    const lambda = new Lambda(this.serverless, this.options);
    const eventHandlers = [];

    this.service.getAllFunctions().forEach((functionKey) => {
      const functionDefinition = this.service.getFunction(functionKey);
      lambda._create(functionKey, functionDefinition); // eslint-disable-line no-underscore-dangle

      const func = (s3Event) => {
        const baseEnvironment = {
          IS_LOCAL: true,
          IS_OFFLINE: true,
        };

        try {
          Object.assign(
            process.env,
            baseEnvironment,
            this.service.provider.environment,
            functionDefinition.environment || {}
          );

          const handler = lambda.get(functionKey);
          handler.setEvent(s3Event);
          handler.runHandler();
        } catch (e) {
          this.serverless.cli.log("Error while running handler", e);
        }
      };

      functionDefinition.events.forEach((event) => {
        const s3 = (event && (event.s3 || event.existingS3)) || undefined;
        if (!s3) {
          return;
        }

        let handlerBucketName;
        let s3Events;
        let s3Rules;

        if (typeof s3 === "object") {
          handlerBucketName = s3.bucket;
          s3Events = s3.events || [s3.event || "*"];
          s3Rules = s3.rules || [];
        } else {
          handlerBucketName = s3;
          s3Events = event.events || [event.event || "*"];
          s3Rules = event.rules || [];
        }

        const bucketResource = this.getResourceForBucket(handlerBucketName);
        const name = bucketResource
          ? bucketResource.Properties.BucketName
          : handlerBucketName;
        s3Events.forEach((existingEvent) => {
          const pattern = existingEvent.replace(/^s3:/, "").replace("*", ".*");
          eventHandlers.push(
            ServerlessS3Local.buildEventHandler(
              s3,
              name,
              pattern,
              s3Rules,
              func
            )
          );
        });
        this.serverless.cli.log(`Found S3 event listener for ${name}`);
      });
    });

    return eventHandlers;
  }

  static buildEventHandler(s3, name, pattern, s3Rules, func) {
    const rule2regex = (rule) =>
      Object.keys(rule).map(
        (key) =>
          (key === "prefix" && { prefix: `^${rule[key]}` }) || {
            suffix: `${rule[key]}$`,
          }
      );
    const rules = [].concat(...s3Rules.map(rule2regex));

    return {
      name,
      pattern,
      rules,
      func,
    };
  }

  getResourceForBucket(bucketName) {
    const logicalResourceName = `S3Bucket${bucketName
      .charAt(0)
      .toUpperCase()}${bucketName.substr(1)}`;
    return this.service.resources && this.service.resources.Resources
      ? this.service.resources.Resources[logicalResourceName]
      : false;
  }

  getAdditionalStacks() {
    const serviceAdditionalStacks = this.service.custom.additionalStacks || {};
    const additionalStacks = [];
    Object.keys(serviceAdditionalStacks).forEach((stack) => {
      additionalStacks.push(serviceAdditionalStacks[stack]);
    });
    return additionalStacks;
  }

  hasPlugin(pluginName, strict = false) {
    return this.service && this.service.plugins && this.service.plugins.modules
      ? this.service.plugins.modules.some((module) => {
          const index = module.indexOf(pluginName);
          return strict ? index === 0 : index >= 0;
        })
      : this.service.plugins.some((plugin) => {
          const index = plugin.indexOf(pluginName);
          return strict ? index === 0 : index >= 0;
        });
  }

  hasAdditionalStacksPlugin() {
    return this.hasPlugin("additional-stacks");
  }

  hasExistingS3Plugin() {
    return this.hasPlugin("existing-s3");
  }

  /**
   * Get bucket list from serverless.yml resources and additional stacks
   *
   * @return {object} Array of bucket name
   */
  buckets() {
    const resources =
      (this.service.resources && this.service.resources.Resources) || {};
    if (this.hasAdditionalStacksPlugin()) {
      let additionalStacks = [];
      additionalStacks = additionalStacks.concat(this.getAdditionalStacks());
      additionalStacks.forEach((stack) => {
        if (stack.Resources) {
          Object.keys(stack.Resources).forEach((key) => {
            if (stack.Resources[key].Type === "AWS::S3::Bucket") {
              resources[key] = stack.Resources[key];
            }
          });
        }
      });
    }

    // support for serverless-plugin-existing-s3
    // https://www.npmjs.com/package/serverless-plugin-existing-s3
    if (this.hasExistingS3Plugin()) {
      const { functions } = this.serverless.service;
      const functionNames = Object.keys(functions);
      functionNames.forEach((name) => {
        functions[name].events.forEach((event) => {
          const eventKeys = Object.keys(event);
          // check if the event has an existingS3 and add if the bucket name
          // is not already in the array
          if (eventKeys.indexOf("existingS3") > -1) {
            const resourceName = `LocalS3Bucket${event.existingS3.bucket}`;
            const localBucket = {
              Type: "AWS::S3::Bucket",
              Properties: {
                BucketName: event.existingS3.bucket,
              },
            };
            resources[resourceName] = localBucket;
          }
        });
      });
    }

    const eventSourceBuckets = Object.keys(this.service.functions).reduce(
      (acc, key) => {
        const serviceFunction = this.service.getFunction(key);
        return acc.concat(
          serviceFunction.events
            .map((event) => {
              const s3 = (event && (event.s3 || event.existingS3)) || undefined;
              if (!s3) {
                return null;
              }

              return typeof s3 === "object" ? s3.bucket : s3;
            })
            .filter((bucket) => bucket !== null)
        );
      },
      []
    );

    return Object.keys(resources)
      .map((key) => {
        if (
          resources[key].Type === "AWS::S3::Bucket" &&
          resources[key].Properties &&
          resources[key].Properties.BucketName
        ) {
          return resources[key].Properties.BucketName;
        }
        return null;
      })
      .concat(this.options.buckets)
      .concat(eventSourceBuckets)
      .filter((n) => n);
  }

  setOptions() {
    const config =
      (this.serverless.service.custom && this.serverless.service.custom.s3) ||
      {};
    this.options = {
      ...defaultOptions,
      ...(this.service.custom || {})["serverless-offline"],
      ...this.options,
      ...config,
    };
  }
}

module.exports = ServerlessS3Local;
