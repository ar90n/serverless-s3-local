const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')

module.exports.webhook = (event, context, callback) => {
  const client = new S3Client({
    forcePathStyle: true,
    credentials: {
      accessKeyId: 'S3RVER',
      secretAccessKey: 'S3RVER',
    },
    endpoint: 'http://localhost:8000'
  });
  client.send(new PutObjectCommand({
    Bucket: 'existing-bucket',
    Key: '1234/data.txt',
    Body: Buffer.from('abcd'),
  })).then(() => { callback(null, 'ok'); });
};

module.exports.s3EventResponse = (event, context, callback) => {
  console.log('S3 Event HEARD');
  callback(null, 'ok');
};
