serverless-s3-local
===============

[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)
[![npm version](https://badge.fury.io/js/serverless-s3-local.svg)](https://badge.fury.io/js/serverless-s3-local)
[![MIT licensed](https://img.shields.io/badge/license-MIT-blue.svg)](https://raw.githubusercontent.com/amplify-education/serverless-domain-manager/master/LICENSE)
[![npm downloads](https://img.shields.io/npm/dt/serverless-s3-local.svg?style=flat)](https://www.npmjs.com/package/serverless-s3-local)

After `v0.9.0`, the API and configurations of serverless-s3-local changed.
So if you want to use old API and configurations, please continue to use `v0.8.X`.
But `v0.8.X` are not maintained.

serverless-s3-local is a Serverless plugin to run S3 clone in local.
This is aimed to accelerate development of AWS Lambda functions by local testing.
I think it is good to collaborate with serverless-offline.

Installation
===============
Use npm
```bash
npm install serverless-s3-local --save-dev
```

Use serverless plugin install
```bash
sls plugin install --name serverless-s3-local
```

Setup MINIO
===============
serverless-s3-local uses `minio` as its backend.
Please see [these documents](https://min.io/docs) and install minio into your environment.

Example
===============

**serverless.yaml**
```yaml
service: serverless-s3-local-example
provider:
  name: aws
  runtime: nodejs18.x
plugins:
  - serverless-s3-local
  - serverless-offline
custom:
  minot:
    port: 9000
resources:
  Resources:
    NewResource:
      Type: AWS::S3::Bucket
      Properties:
        BucketName: local-bucket
functions:
  webhook:
    handler: handler.webhook
    events:
      - http:
        method: GET
        path: /
  s3hook:
    handler: handler.s3hook
    events:
      - s3: local-bucket
        event: s3:*

```

**handler.js**
```js
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

module.exports.webhook = async (event, context) => {
  const client = new S3Client({
    forcePathStyle: true,
    credentials: {
      accessKeyId: "minioadmin", // This specific key is required when working offline
      secretAccessKey: "minioadmin",
    },
    endpoint: "http://localhost:9000",
  });

  await client.send(
    new PutObjectCommand({
      Bucket: "local-bucket",
      Key: "1234",
      Body: Buffer.from("abcd"),
    })
  );

  return "ok"
};

module.exports.s3hook = async (event, context) => {
  console.log(JSON.stringify(event));
  console.log(JSON.stringify(context));
  console.log(JSON.stringify(process.env));

  return "ok"
};
```

Configuration options
===============

Configuration options can be defined in multiple ways. They will be parsed with the following priority:
- `custom.minio` in serverless.yml
- Default values (see table below)

| Option | Description                                                                                                                                                      | Type | Default value |
| ------ |------------------------------------------------------------------------------------------------------------------------------------------------------------------| ---- | ------------- |
| address | The host/IP to bind the S3 server to                                                                                                                             | string | `'127.0.0.1'` |
| port | The port that S3 server will listen to                                                                                                                           | number | `9000` |
| directory | The location where the S3 files will be created. The directory must exist, it won't be created                                                                   | string | `null` (create temp directory automatically)|
| accessKeyId | The Access Key Id to authenticate requests                                                                                                                       | string | `'minioadmin'` |
| secretAccessKey | The Secret Access Key to authenticate requests                                                                                                                   | string | `'minioadmin'` |

Feature
===============
* Start local S3 server with specified root directory and port.
* Create buckets at launching.
* Support serverless-webpack
* Support S3 events.

Triggering AWS Events offline
===============
This plugin will create a temporary directory to store mock S3 info.  You must use the AWS cli to trigger events locally.
First, using aws configure set up a new profile, i.e. `aws configure --profile s3local`.  The default creds are
```
aws_access_key_id = minioadmin
aws_secret_access_key = minioadmin
```

 You can now use this profile to trigger events. e.g. to trigger a put-object on a file at `~/tmp/userdata.csv` in a local bucket run:
 `aws --endpoint http://localhost:4569 s3 cp ~/tmp/data.csv s3://local-bucket/userdata.csv --profile s3local`

You should see the event trigger in the serverless offline console: `info: PUT /local-bucket/user-data.csv 200 16ms 0b` and a new object with metadata will appear in your local bucket.

See also
===============
* [minio](https://min.io)
* [serverless-offline](https://github.com/dherault/serverless-offline)
* [serverless-webpack](https://github.com/serverless-heaven/serverless-webpack)

License
===============
This software is released under the MIT License, see [LICENSE](LICENSE).
