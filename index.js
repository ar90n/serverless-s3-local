const Promise = require('bluebird');
const S3rver = require('s3rver');
const fs = require('fs-extra'); // Using fs-extra to ensure destination directory exist
const AWS = require('aws-sdk');

class ServerlessS3Local {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.service = serverless.service;
    this.options = options;
    this.provider = 'aws';
    this.client = null;

    this.commands = {
      s3: {
        commands: {
          start: {
            usage: 'Start S3 local server.',
            lifecycleEvents: ['startHandler'],
            options: {
              port: {
                shortcut: 'p',
                usage: 'The port number that S3 will use to communicate with your application. If you do not specify this option, the default port is 4569',
              },
              directory: {
                shortcut: 'd',
                usage: 'The directory where S3 will store its objects. If you do not specify this option, the file will be written to the current directory.',
              },
              buckets: {
                shortcut: 'b',
                usage: 'After starting S3 local, create specified buckets',
              },
              cors: {
                shortcut: 'c',
                usage: 'Enable CORS',
              },
              noStart: {
                shortcut: 'n',
                default: false,
                usage: 'Do not start S3 local (in case it is already running)',
              },
            },
          },
        },
      },
    };

    this.hooks = {
      's3:start:startHandler': this.startHandler.bind(this),
      'before:offline:start:init': this.startHandler.bind(this),
      'before:offline:start': this.startHandler.bind(this),
      'before:offline:start:end': this.endHandler.bind(this),
    };
  }

  startHandler() {
    return new Promise((resolve, reject) => {
      const config = (this.serverless.service.custom && this.serverless.service.custom.s3) || {};
      const options = Object.assign({}, this.options, config);

      // Mix buckets from resources list and buckets from parameters
      const buckets = this.buckets().concat(options.buckets) || [];
      const port = options.port || 4569;
      const hostname = 'localhost';
      const silent = false;
      const cors = options.cors || false;

      if (options.noStart) {
        ServerlessS3Local.createBuckets(port, buckets);
        resolve();
        return;
      }
      const dirPath = options.directory || './buckets';
      fs.ensureDirSync(dirPath); // Create destination directory if not exist
      const directory = fs.realpathSync(dirPath);

      this.client = new S3rver({
        port,
        hostname,
        silent,
        directory,
        cors,
      }).run((err, s3Host, s3Port) => {
        if (err) {
          console.error('Error occured while starting S3 local.');
          reject(err);
          return;
        }

        console.log(`S3 local started ( port:${s3Port} )`);

        ServerlessS3Local.createBuckets(s3Port, buckets);
        resolve();
      });
    });
  }

  endHandler() {
    if (!this.options.noStart) {
      this.client.close();
      console.log('S3 local closed');
    }
  }

  static createBuckets(port, buckets) {
    const s3Client = new AWS.S3({
      s3ForcePathStyle: true,
      endpoint: new AWS.Endpoint(`http://localhost:${port}`),
    });
    buckets.forEach((bucket) => {
      s3Client.createBucket({ Bucket: bucket }, () => {});
    });
  }

  /**
   * Get bucket list from serveless.yml resources
   *
   * @return {object} Array of bucket name
   */
  buckets() {
    const resources = (this.service.resources && this.service.resources.Resources) || {};
    return Object.keys(resources).map((key) => {
      if (resources[key].Type === 'AWS::S3::Bucket') {
        return resources[key].Properties.BucketName;
      }
      return null;
    }).filter(n => n);
  }
}

module.exports = ServerlessS3Local;
