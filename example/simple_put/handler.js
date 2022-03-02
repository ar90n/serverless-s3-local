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
    Bucket: 'local-bucket',
    Key: '1234',
    Body: Buffer.from('abcd'),
  })).then(() =>{ callback(null, 'ok'); });
};
