const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const webhook = async (event, context) => {
  const client = new S3Client({
    forcePathStyle: true,
    credentials: {
      accessKeyId: "minioadmin",
      secretAccessKey: "minioadmin",
    },
    endpoint: "http://localhost:9000",
  });

  await client.send(
    new PutObjectCommand({
      Bucket: "local-bucket",
      Key: "1234",
      Body: Buffer.from("abcd"),
    }),
  );

  return {
    statusCode: 200,
    body: JSON.stringify("ok"),
  };
};

const s3hook = async (event, context) => {
  console.log(JSON.stringify(event));
  console.log(JSON.stringify(context));
  return {
    statusCode: 200,
    body: JSON.stringify("ok"),
  };
};

export { webhook, s3hook };
