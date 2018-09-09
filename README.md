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

```bash
npm install serverless-s3-local --save-dev
```

Example
===============

**serverless.yaml**
```yaml
service: serverless-s3-local-example
provider:
  name: aws
  runtime: nodejs4.3
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
    host: 0.0.0.0
    port: 8000
    directory: /tmp
    # Uncomment the first line only if you want to use cors with specified policy
    # Uncomment the second line only if you don't want to use cors
    # Not uncomment the these lines only if your wanto use cors with default policy
    # cors: relative/path/to/your/cors/policy/xml
    # cors: false
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
```

**handler.js**
```js
const AWS = require('aws-sdk');

module.exports.webhook = (event, context, callback) => {
  const S3 = new AWS.S3({
    s3ForcePathStyle: true,
    endpoint: new AWS.Endpoint('http://localhost:8000'),
  });
  S3.putObject({
    Bucket: 'local-bucket',
    Key: '1234',
    Body: new Buffer('abcd')
  }, () => {} );
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
