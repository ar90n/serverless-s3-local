serverless-s3-local
===============

[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)
[![npm version](https://badge.fury.io/js/serverless-s3-local.svg)](https://badge.fury.io/js/serverless-s3-local)
[![MIT licensed](https://img.shields.io/badge/license-MIT-blue.svg)](https://raw.githubusercontent.com/amplify-education/serverless-domain-manager/master/LICENSE)
[![npm downloads](https://img.shields.io/npm/dt/serverless-s3-local.svg?style=flat)](https://www.npmjs.com/package/serverless-s3-local)
[![dependencies](https://david-dm.org/ar90n/serverless-s3-local/status.svg)](https://david-dm.org/ar90n/serverless-s3-local)
[![dev-dependencies](https://david-dm.org/ar90n/serverless-s3-local/dev-status.svg)](https://david-dm.org/ar90n/serverless-s3-local?type=dev)

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

Example
===============

**serverless.yaml**
```yaml
service: serverless-s3-local-example
provider:
  name: aws
  runtime: nodejs8.10
plugins:
  - serverless-s3-local
  - serverless-offline
custom:
# Uncomment only if you want to collaborate with serverless-plugin-additional-stacks
# additionalStacks:
#    permanent:
#      Resources:
#        S3BucketData:
#            Type: AWS::S3::Bucket
#            Properties:
#                BucketName: ${self:service}-data
  s3:
    # Uncomment the following line only if you want to specify host address of S3 service.
    # adress: 0.0.0.0
    # Uncomment the following line only if you want to specify S3 server address.
    # Ordinary, this value is localhost. But you can modify this value to use other S3 server.
    # host: 0.0.0.0
    port: 8000
    directory: /tmp  # this directory must be already created.
    # Uncomment the first line only if you want to use cors with specified policy
    # Uncomment the second line only if you don't want to use cors
    # Not uncomment the these lines only if your wanto use cors with default policy
    # cors: relative/path/to/your/cors.xml
    # website: relative/path/to/your/website.xml
    # Uncomment only if you already have a S3 server running locally
    # noStart: true
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
  s3hook:
    handler: handler.s3hook
    events:
      - s3: local-bucket
        event: s3:*

```

**handler.js**
```js
const AWS = require('aws-sdk');

module.exports.webhook = (event, context, callback) => {
  const S3 = new AWS.S3({
    s3ForcePathStyle: true,
    accessKeyId: 'S3RVER', // This specific key is required when working offline
    secretAccessKey: 'S3RVER',
    endpoint: new AWS.Endpoint('http://localhost:8000'),
  });
  S3.putObject({
    Bucket: 'local-bucket',
    Key: '1234',
    Body: new Buffer('abcd')
  }, () => {} );
};

module.exports.s3hook = (event, context) => {
  console.log(JSON.stringify(event));
  console.log(JSON.stringify(context));
  console.log(JSON.stringify(process.env));
};
```

Feature
===============
* Start local S3 server with specified root directory and port.
* Create buckets at launching.
* Support serverless-plugin-additional-stacks
* Support serverless-webpack
* Support serverless-plugin-existing-s3
* Support S3 events.


Working with IaC tools
===============
If your want to work with IaC tools such as terraform, you have to manage creating bucket process.
In this case, please follow the below steps.

1. Comment out configurations about S3 Bucket from resouces section in serverless.yml.
```
#resources:
#  Resources:
#    NewResource:
#      Type: AWS::S3::Bucket
#      Properties:
#        BucketName: local-bucket
```

2. Create bucket directory in s3rver working directory.
```
$ mkdir /tmp/local-bucket
```


Triggering AWS Events offline
===============
This plugin will create a temporary directory to store mock S3 info.  You must use the aws cli to trigger events locally.
First, using aws configure set up a new profile, i.e. `aws s3 configure --profile s3local` .  The default creds are 
```
aws_access_key_id = S3RVER
aws_secret_access_key = S3RVER
```
 
 You can now use this profile to trigger events. e.g. to trigger a put-object on a file at `~/tmp/userdata.csv` in a local bucket run:
 `aws --endpoint http://localhost:4569 s3api put-object --bucket local-bucket --key userdata.csv --body ~/tmp/data.csv --profile s3local`

You should see the event trigger in the serverless offline console: `info: PUT /local-bucket/user-data.csv 200 16ms 0b` and a new object with metadata will appear in your local bucket.

See also
===============
* [s3rver](https://github.com/jamhall/s3rver)
* [serverless-offline](https://github.com/dherault/serverless-offline)
* [serverless-webpack](https://github.com/serverless-heaven/serverless-webpack)
* [serverless-plugin-additional-stacks](https://github.com/SC5/serverless-plugin-additional-stacks)
* [serverless-plugin-existing-s3](https://www.npmjs.com/package/serverless-plugin-existing-s3)

License
===============
This software is released under the MIT License, see [LICENSE](LICENSE).
