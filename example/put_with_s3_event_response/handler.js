const AWS = require('aws-sdk');

module.exports.webhook = (event, context, callback) => {
  const S3 = new AWS.S3({
    s3ForcePathStyle: true,
    endpoint: new AWS.Endpoint('http://localhost:8000'),
    accessKeyId: 'S3RVER',
    secretAccessKey: 'S3RVER',
  });
  S3.putObject({
    Bucket: 'existing-bucket',
    Key: '1234/data.txt',
    Body: Buffer.from('abcd'),
  }, () => { callback(null, 'ok'); });
};

module.exports.s3EventResponse = (event, context, callback) => {
  console.log('S3 Event HEARD');
  callback(null, 'ok');
};
