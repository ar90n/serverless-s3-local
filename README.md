serverless-s3-local
===============

serverless-s3-local is a Serverless plugin to run S3 clone in local.  
This is aimed to accelerate development of AWS Lambda functions by local testing.  
I think it is good to collaborate with serverless-offline.  

Installation
===============

    npm install serverless-s3-local --save-dev

Example
===============
serverless.yaml  

    service: serverless-s3-local-example
    provider:
      name: aws
      runtime: nodejs4.3
    plugins:
      - serverless-s3-local
      - serverless-offline
    custom:
      s3:
        port: 8000
        directory: /tmp
        cors: false
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

handler.js  

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

Feature
===============
* Start local S3 server with specified root directory and port.
* Create buckets at launching.

See also
===============
* [s3rver](https://github.com/jamhall/s3rver)
* [serverless-offline](https://github.com/dherault/serverless-offline)

License
===============
This software is released under the MIT License, see LICENSE.txt.
