import got from 'got';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import fs from 'fs';

const client = new S3Client({
  forcePathStyle: true,
  credentials: {
    accessKeyId: 'S3RVER',
    secretAccessKey: 'S3RVER',
  },
  endpoint: `http://localhost:8000`,
  region: 'us-east-1'
});

const sleep = msec => new Promise(resolve => setTimeout(resolve, msec));

it('event handling with python', async () => {
  const response = await client.send(new PutObjectCommand({Bucket: "local-bucket", Key: "incoming/img.jpg", Body: "abcd"}));
  const etag = response.ETag.slice(1, -1);

  await sleep(5000);

  console.log(`/tmp/${etag}`);
  const found = fs.existsSync(`/tmp/${etag}`);
  expect(found).toEqual(true);
}, 8000);
