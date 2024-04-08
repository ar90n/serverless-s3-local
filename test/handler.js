import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import * as path from "path";

const client = new S3Client({
  forcePathStyle: true,
  credentials: {
    accessKeyId: "minioadmin",
    secretAccessKey: "minioadmin",
  },
  endpoint: "http://localhost:9000",
});

export const copy_file = async (event, context) => {
  const received_key = event.Records[0].s3.object.key;
  const get_param = {
    Bucket: "local-bucket",
    Key: received_key,
  };
  const filename = path.basename(received_key);

  const { Body: stream } = await client.send(new GetObjectCommand(get_param));
  const recv_data = Buffer.concat(await stream.toArray()).toString("utf-8");

  await client.send(
    new PutObjectCommand({
      Bucket: "local-bucket",
      Key: `copy_file/processed/${filename}`,
      Body: Buffer.from(recv_data),
    }),
  );

  return {
    statusCode: 200,
    body: JSON.stringify("ok"),
  };
};

export const save_context = async (event, context) => {
  const ret = {
    event: event,
    context: context,
    env: process.env,
  };

  await client.send(
    new PutObjectCommand({
      Bucket: "local-bucket",
      Key: "save_context/processed/context.json",
      Body: Buffer.from(JSON.stringify(ret)),
    }),
  );

  return {
    statusCode: 200,
    body: JSON.stringify("ok"),
  };
};
