import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export const createTempDirectory = (): string => {
  const tempDirectoryPrefix = path.join(os.tmpdir(), "serverless-s3-local");
  const tempDirectory = fs.mkdtempSync(tempDirectoryPrefix);
  return tempDirectory;
};

export const generateRandomString = (): string => {
  let result = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  for (let i = 0; i < 16; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
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

export const waitFor = async (
  callback: () => Promise<boolean>,
  sleepTimeMs: number,
  retryCount: number,
): Promise<void> => {
  for (let i = 0; i < retryCount; i++) {
    if (await callback()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, sleepTimeMs));
  }

  throw new Error(
    "Timeout exceeded while waiting for the condition to be true",
  );
};
