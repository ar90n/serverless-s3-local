import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";

export const createTempDirectory = (): string => {
  const tempDirectoryPrefix = path.join(os.tmpdir(), "serverless-s3-local");
  const tempDirectory = fs.mkdtempSync(tempDirectoryPrefix);
  return tempDirectory;
};

export const randomHexString = (length: number): string => {
  return crypto
    .randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length);
};

export const streamToBuffer = async (
  stream: NodeJS.ReadableStream,
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    stream.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    stream.on("error", (error) => {
      reject(error);
    });
  });
};
