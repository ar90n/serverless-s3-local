import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export const webhook = (event, context, callback) => {
  const client = new S3Client({
    forcePathStyle: true,
    credentials: {
      accessKeyId: "minioadmin",
      secretAccessKey: "minioadmin",
    },
    endpoint: "http://localhost:9000",
  });
  client
    .send(
      new PutObjectCommand({
        Bucket: "local-bucket",
        Key: "1234",
        Body: Buffer.from("abcd"),
      }),
    )
    .then(() => {
      callback(null, "ok");
    });
};
