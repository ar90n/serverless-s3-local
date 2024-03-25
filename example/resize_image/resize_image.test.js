import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";

const client = new S3Client({
  forcePathStyle: true,
  credentials: {
    accessKeyId: "S3RVER",
    secretAccessKey: "S3RVER",
  },
  endpoint: `http://localhost:8000`,
  region: "us-east-1",
});

const sleep = (msec) => new Promise((resolve) => setTimeout(resolve, msec));

it("jpeg resize", async () => {
  const buffer = await sharp({
    create: {
      width: 640,
      height: 640,
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .jpeg()
    .toBuffer();

  await client.send(
    new PutObjectCommand({
      Bucket: "local-bucket",
      Key: "incoming/img.jpg",
      Body: buffer,
    })
  );

  await sleep(3000);

  //const {Body: stream} = await client.send(new GetObjectCommand({Bucket: "local-bucket", Key: "processed/img.jpg"}));
  //  await client.send(new GetObjectCommand({Bucket: "local-bucket", Key: "processed/img.jpg"}));
  //  const metadata = await sharp(stream).metadata();
  //  expect(metadata.width).toEqual(320);
  //  expect(metadata.height).toEqual(320);
});
