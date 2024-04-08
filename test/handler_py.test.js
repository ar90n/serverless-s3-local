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

describe("test py event handlers", () => {
  let container;
  let client;

  beforeAll(async () => {
    container = await testImage
      .withExposedPorts(9001)
      .withEnvironment({ SERVERLESS_YML_FILE: "serverless_py.yml" })
      .withWaitStrategy(Wait.forLogMessage("Serverless-S3-Local started."))
      .start();

    const port = container.getMappedPort(9001);
    client = new S3Client({
      forcePathStyle: true,
      credentials: {
        accessKeyId: "minioadmin",
        secretAccessKey: "minioadmin",
      },
      endpoint: `http://localhost:${port}`,
      region: "us-east-1",
    });
  });

  afterAll(async () => {
    await container.stop();
  });

  it("trigger with rules", async () => {
    const expected = "abcd";
    await client.send(
      new PutObjectCommand({
        Bucket: "local-bucket",
        Key: "incoming/abcd.txt",
        Body: Buffer.from(expected),
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const { Body: stream } = await client.send(
      new GetObjectCommand({
        Bucket: "local-bucket",
        Key: "processed/abcd.txt",
      }),
    );
    const actual = Buffer.concat(await stream.toArray()).toString("utf-8");

    expect(actual).toEqual(expected);
  });
});
