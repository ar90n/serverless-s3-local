import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export const createTempDirectory = (): string => {
  const tempDirectoryPrefix = path.join(os.tmpdir(), "serverless-s3-local");
  const tempDirectory = fs.mkdtempSync(tempDirectoryPrefix);
  return tempDirectory;
};
