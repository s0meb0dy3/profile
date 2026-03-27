import path from "node:path";
import { buildResumeFromDisk } from "./resume-builder.mjs";

async function main() {
  const root = process.cwd();
  const { outputPath } = await buildResumeFromDisk({ root });
  console.log(`Built ${path.relative(root, outputPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
