const AWS = require('aws-sdk');

module.exports.webhook = (event, context, callback) => {
  const S3 = new AWS.S3({
    s3ForcePathStyle: true,
    endpoint: new AWS.Endpoint('http://localhost:8000'),
    accessKeyId: 'S3RVER',
    secretAccessKey: 'S3RVER',
  });
  S3.putObject({
    Bucket: 'local-bucket',
    Key: '1234',
    Body: Buffer.from('abcd'),
  }, () => { callback(null, 'ok'); });
};
