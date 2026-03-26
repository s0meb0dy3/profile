import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const files = ["resume.md", "resume.css"].map((file) => path.join(root, file));
let timer = null;

function runBuild() {
  const child = spawn(process.execPath, [path.join(root, "build.mjs")], {
    cwd: root,
    stdio: "inherit",
  });

  child.on("exit", () => {
    // no-op
  });
}

for (const file of files) {
  fs.watch(file, () => {
    clearTimeout(timer);
    timer = setTimeout(runBuild, 120);
  });
}

console.log("Watching resume.md and resume.css");
runBuild();
