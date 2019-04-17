import * as AWS from 'aws-sdk';

const webhook = (event, context, callback) => {
  const S3 = new AWS.S3({
    s3ForcePathStyle: true,
    endpoint: new AWS.Endpoint('http://localhost:8000'),
    accessKeyId: 'S3RVER',
    secretAccessKey: 'S3RVER',
  });
  S3.putObject({
    Bucket: 'local-bucket',
    Key: '1234',
    Body: new Buffer('abcd'),
  }, () => {});

  callback(null, 'ok');
};

const s3hook = (event, context) => {
  console.log(JSON.stringify(event));
  console.log(JSON.stringify(context));
};

export {
  webhook,
  s3hook
};
