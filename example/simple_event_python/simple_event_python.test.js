const got = require('got');
const AWS = require('aws-sdk');
const sharp = require('sharp');
const fs = require('fs');

const credentials = {
  accessKeyId: 'S3RVER',
  secretAccessKey: 'S3RVER',
}

const s3client = new AWS.S3({
  credentials,
  endpoint: 'http://localhost:8000',
  s3ForcePathStyle: true
})

const sleep = msec => new Promise(resolve => setTimeout(resolve, msec));

it('event handling with python', async () => {
  const response = await s3client.upload({Bucket: "local-bucket", Key: "incoming/img.jpg", Body: "abcd"}, {responseType: 'json'}).promise();
  const etag = response.ETag.slice(1, -1);

  await sleep(1000);

  console.log(`/tmp/${etag}`);
  const found = fs.existsSync(`/tmp/${etag}`);
  expect(found).toEqual(true);
});
