import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

export const webhook = (event, context, callback) => {
  const client = new S3Client({
    forcePathStyle: true,
    credentials: {
      accessKeyId: "S3RVER",
      secretAccessKey: "S3RVER",
    },
    endpoint: "http://localhost:8000",
  });
  client
    .send(
      new PutObjectCommand({
        Bucket: "existing-bucket",
        Key: "1234/data.txt",
        Body: Buffer.from("abcd"),
      })
    )
    .then(() => {
      callback(null, "ok");
    });
};

export const s3EventResponse = (event, context, callback) => {
  console.log("S3 Event HEARD");
  callback(null, "ok");
};
