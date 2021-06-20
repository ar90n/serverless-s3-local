const got = require('got');
const AWS = require('aws-sdk');

const credentials = {
  accessKeyId: 'S3RVER',
  secretAccessKey: 'S3RVER',
}

const s3client = new AWS.S3({
  credentials,
  endpoint: 'http://localhost:8000',
  s3ForcePathStyle: true
})

it('works with async/await', async () => {
  const {body} = await got('http://localhost:3000/dev', {responseType: 'json'});
  expect(body).toEqual('ok');

  const {Body: data} = await s3client.getObject({Bucket: "local-bucket", Key: "1234"}).promise();
  const content = String.fromCharCode(...data);
  expect(content).toEqual('abcd');
});
