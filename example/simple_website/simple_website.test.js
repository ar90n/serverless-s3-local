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
  const content = await fetch("http://localhost:3000/dev").then((res) =>
    res.text(),
  );
  const actual = await fetch("http://localhost:9000/test-site/index.html").then(
    (res) => res.text(),
  );

  expect(content).toEqual(actual);
});
