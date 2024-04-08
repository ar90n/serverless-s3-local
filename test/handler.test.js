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

describe("test js event handlers", () => {
  let container;
  let client;

  beforeAll(async () => {
    container = await testImage
      .withExposedPorts(9000)
      .withEnvironment({ SERVERLESS_YML_FILE: "serverless.yml" })
      .withWaitStrategy(Wait.forLogMessage("Serverless-S3-Local started."))
      .start();

    const port = container.getMappedPort(9000);
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
        Key: "copy_file/incoming/abcd.txt",
        Body: Buffer.from(expected),
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const { Body: stream } = await client.send(
      new GetObjectCommand({
        Bucket: "local-bucket",
        Key: "copy_file/processed/abcd.txt",
      }),
    );
    const actual = Buffer.concat(await stream.toArray()).toString("utf-8");

    expect(actual).toEqual(expected);
  });

  it("failed to trigger by wrong prefix", async () => {
    const expected = "abcd";
    await client.send(
      new PutObjectCommand({
        Bucket: "local-bucket",
        Key: "copy_file/wrong/file.txt",
        Body: Buffer.from(expected),
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 500));

    expect.assertions(1);
    await client
      .send(
        new GetObjectCommand({
          Bucket: "local-bucket",
          Key: "copy_file/processed/file.txt",
        }),
      )
      .catch((e) => {
        expect(e.Code).toEqual("NoSuchKey");
      });
  });

  it("failed to trigger by wrong suffix", async () => {
    const expected = "abcd";
    await client.send(
      new PutObjectCommand({
        Bucket: "local-bucket",
        Key: "copy_file/incoming/file.md",
        Body: Buffer.from(expected),
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 500));

    expect.assertions(1);
    await client
      .send(
        new GetObjectCommand({
          Bucket: "local-bucket",
          Key: "copy_file/processed/file.md",
        }),
      )
      .catch((e) => {
        expect(e.Code).toEqual("NoSuchKey");
      });
  });
  it("pass correct context, event and envs", async () => {
    await client.send(
      new PutObjectCommand({
        Bucket: "local-bucket",
        Key: "save_context/trigger/touch",
        Body: Buffer.from("trigger"),
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 500));

    const { Body: stream } = await client.send(
      new GetObjectCommand({
        Bucket: "local-bucket",
        Key: "save_context/processed/context.json",
      }),
    );
    const actual = JSON.parse(
      Buffer.concat(await stream.toArray()).toString("utf-8"),
    );

    //expect(actual).toEqual({});
  });
});
