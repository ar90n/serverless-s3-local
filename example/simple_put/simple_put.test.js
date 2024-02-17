import got from "got";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const client = new S3Client({
  forcePathStyle: true,
  credentials: {
    accessKeyId: "minioadmin",
    secretAccessKey: "minioadmin",
  },
  endpoint: "http://localhost:9000",
  region: "us-east-1",
});

it("works with async/await", async () => {
  const { body } = await got("http://localhost:3000/dev", {
    responseType: "json",
  });
  expect(body).toEqual("ok");

  const streamToString = (stream) =>
    new Promise((resolve, reject) => {
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });

  const { Body: stream } = await client.send(
    new GetObjectCommand({
      Bucket: "local-bucket",
      Key: "1234",
    }),
  );
  const content = await streamToString(stream);
  expect(content).toEqual("abcd");
});
