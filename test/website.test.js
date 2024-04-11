const { GenericContainer, Wait } = require("testcontainers");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");

jest.setTimeout(300000);

let testImage;
beforeAll(async () => {
  testImage = await GenericContainer.fromDockerfile("./", "./test/Dockerfile")
    .withCache(true)
    .build("serverless-s3-local-test", { deleteOnExit: false });
});

const index_html = `<!DOCTYPE html>
<html>
<head>
    <title>Test Page</title>
</head>
<body>
    <h1>It works</h1>
</body>
</html>`;

const error_html = `<!DOCTYPE html>
<html>
<head>
    <title>Test Page</title>
</head>
<body>
    <h1>404 Not Found</h1>
</body>
</html>`;

describe("test website", () => {
  let container;
  let client;

  beforeAll(async () => {
    container = await testImage
      .withExposedPorts(9000, 2929)
      .withEnvironment({ SERVERLESS_YML_FILE: "serverless_website.yml" })
      .withWaitStrategy(Wait.forLogMessage("Serverless-S3-Local started."))
      .start();

    const s3port = container.getMappedPort(9000);
    client = new S3Client({
      forcePathStyle: true,
      credentials: {
        accessKeyId: "minioadmin",
        secretAccessKey: "minioadmin",
      },
      endpoint: `http://localhost:${s3port}`,
      region: "us-east-1",
    });

    await client.send(
      new PutObjectCommand({
        Bucket: "test-site",
        Key: "index.html",
        Body: Buffer.from(index_html),
      }),
    );

    await client.send(
      new PutObjectCommand({
        Bucket: "test-site",
        Key: "error.html",
        Body: Buffer.from(error_html),
      }),
    );
  });

  afterAll(async () => {
    await container.stop();
  });

  it("fetch index.html", async () => {
    const port = container.getMappedPort(2929);
    const response = await fetch(
      `http://localhost:${port}/test-site/index.html`,
    );
    const text = await response.text();
    expect(text).toEqual(index_html);
  });
  it("route index.html", async () => {
    const port = container.getMappedPort(2929);
    const response = await fetch(`http://localhost:${port}/test-site/`);
    const text = await response.text();
    expect(text).toEqual(index_html);
  });
  it("fetch error.html", async () => {
    const port = container.getMappedPort(2929);
    const response = await fetch(
      `http://localhost:${port}/test-site/error.html`,
    );
    const text = await response.text();
    expect(text).toEqual(error_html);
  });
  it("fetch 404", async () => {
    const port = container.getMappedPort(2929);
    const response = await fetch(
      `http://localhost:${port}/test-site/notfound.html`,
    );
    const text = await response.text();
    expect(text).toEqual(error_html);
  });
});
