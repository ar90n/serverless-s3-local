import path from "path";

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";

const client = new S3Client({
  forcePathStyle: true,
  credentials: {
    accessKeyId: "minioadmin",
    secretAccessKey: "minioadmin",
  },
  endpoint: "http://localhost:9000",
});

export const webhook = async (event, context) => {
  return {
    statusCode: 200,
    body: JSON.stringify("ok"),
  };
};

export const s3hook = async (event, context) => {
  const received_key = event.Records[0].s3.object.key;
  const get_param = {
    Bucket: "local-bucket",
    Key: received_key,
  };
  const filename = path.basename(received_key);

  const streamToBuffer = (stream) =>
    new Promise((resolve, reject) => {
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks)));
    });

  const data = await client.send(new GetObjectCommand(get_param));
  const buf = await streamToBuffer(data.Body);
  const sharp_data = await sharp(buf).resize(320).toBuffer();

  const put_param = {
    Bucket: "local-bucket",
    Key: `processed/${filename}`,
    Body: sharp_data,
  };
  await client.send(new PutObjectCommand(put_param));

  return {
    statusCode: 200,
    body: JSON.stringify("ok"),
  };
};
