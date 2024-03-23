import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";

const client = new S3Client({
  forcePathStyle: true,
  credentials: {
    accessKeyId: "minioadmin",
    secretAccessKey: "minioadmin",
  },
  endpoint: "http://localhost:9000",
});

const uploadFile = async (bucket, filePath) => {
  const fileStream = fs.createReadStream(filePath);
  const params = {
    Bucket: bucket,
    Key: path.basename(filePath),
    Body: fileStream,
  };
  try {
    const data = await client.send(new PutObjectCommand(params));
    console.log(`File uploaded successfully. ${data}`);
  } catch (err) {
    console.log("Error", err);
  }
};

const syncDirectory = async (bucket, dirPath) => {
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    await uploadFile(bucket, path.join(dirPath, file));
  }
};

await syncDirectory("test-site", "public");

export const webhook = async (event, context) => {
  const response = await fetch("http://localhost:9000/test-site/index.html");
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const data = await response.text();
  return {
    statusCode: 200,
    body: data,
  };
};
