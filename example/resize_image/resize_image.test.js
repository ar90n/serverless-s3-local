const got = require('got');
const AWS = require('aws-sdk');
const sharp = require('sharp');

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

it('jpeg resize', async () => {
  const buffer = await sharp({
    create: {
      width: 640,
      height: 640,
      channels: 3,
      background: { r: 255, g: 0, b: 0 }
    }
  })
  .jpeg()
  .toBuffer();

  await s3client.upload({Bucket: "local-bucket", Key: "incoming/img.jpg", Body: buffer}).promise();

  await sleep(3000);

  const {Body: data} = await s3client.getObject({Bucket: "local-bucket", Key: "processed/img.jpg"}).promise();
  const metadata = await sharp(data).metadata();
  expect(metadata.width).toEqual(320);
  expect(metadata.height).toEqual(320);
});
