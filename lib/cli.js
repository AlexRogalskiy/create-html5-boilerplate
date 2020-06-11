"use strict";
const yargs_parser = require("yargs-parser");
const path = require("path");
const chalk = require("chalk");
const langsList = require("./countries.json");
const prompts = require("prompts");
// const semver = require("semver");
const fuzzy = require("fuzzy");
const ora = require("ora");
const { extract } = require("pacote");
const glob = require("fast-glob");
const fs = require("fs-extra");
const os = require("os");
const packageName = "html5-boilerplate";
const tempDir = os.tmpdir() + `/${packageName}-staging`;
const elapsed = require("elapsed-time-logger");
let spinner;

module.exports = async (argvs) => {
  const argv = yargs_parser(argvs, {
    alias: { release: ["r"], yes: ["y"] },
  });
  const timer = elapsed.start();
  const version = argv["release"] || "latest";
  const targetDir = path.resolve(argv["_"][0] || "./");
  spinner = ora(
    `Downloading ${packageName} version '${version}' to ${targetDir}`
  ).start();
  await fs.ensureDir(tempDir);
  try {
    const { from: nameWithVersion } = await extract(
      packageName + "@" + version,
      tempDir,
      {}
    );
    await fs.copy(tempDir + "/dist", targetDir);
    const timerDownloaded = timer.get();
    await onLoad(targetDir, version, argv);
    spinner.succeed(
      `${nameWithVersion} copied to ${targetDir} in ${timerDownloaded}. Have fun!`
    );
    return;
  } catch (err) {
    if (err.code === "ETARGET") {
      const msg = chalk.red(
        `version '${err.wanted}' not found in npm registry\navailable versions:\n`
      );
      spinner.fail(msg + err.versions.reverse().join(" | "));
      throw err.code;
    }
    spinner.fail("Unexpected error");
    throw new Error(err);
  } finally {
    await fs.remove(tempDir);
  }
};

const onLoad = async (targetDir, version, argv) => {
  // see https://github.com/mrmlnc/fast-glob#how-to-write-patterns-on-windows
  const npmIgnoreFiles = await glob(
    `${targetDir.replace(/\\/g, "/")}/**/.npmignore`
  );
  for (const npmIgnore of npmIgnoreFiles) {
    await fs.rename(npmIgnore, npmIgnore.replace(/\.npmignore$/, ".gitignore"));
  }
  const skipPrompts = argv["yes"] === true;

  spinner.stop();
  if (skipPrompts) {
    return;
  }
  let langListOut = langsList.map((v) => {
    return { title: `${v.title} (${v.value})`, value: v.value };
  });
  langListOut.splice(1, 0, { title: "Enter custom", value: "custom" });
  const questions = [
    {
      type: "autocomplete",
      name: "langChoice",
      message: "Select language",
      choices: langListOut,
      suggest: async (input, choices) => {
        return fuzzy
          .filter(input, choices, { extract: (el) => el.title })
          .map((v) => v.original);
      },
    },
  ];
  let lang = argv.lang || null;
  if (!lang) {
    let { langChoice } = await prompts(questions);
    if (langChoice === "custom") {
      let { customLang } = await prompts({
        type: "text",
        name: "customLang",
        message: "Enter custom language code",
      });
      langChoice = customLang;
    }
    lang = langChoice;
  }
  try {
    const indexFile = targetDir + "/index.html";
    const sourceHTML = await fs.readFile(indexFile, "utf-8");
    const resultHTML = sourceHTML.replace(
      /(<html.*lang=)\"([^"]*)\"/gi,
      `$1"${lang || ""}"`
    );
    await fs.writeFile(indexFile, resultHTML);
  } catch (err) {
    throw new Error(err);
  }
};
