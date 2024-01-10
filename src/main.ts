#!/usr/bin/env node

import { readFile, readdir, watch } from "fs/promises";
import fetch from "node-fetch";
import { extname } from "path";

type Message = {
  message: {
    type: "START" | "PUT" | "DELETE";
    startMessage?: {
      files: {
        filename: string;
        content: string;
      }[];
    };
    putMessage?: {
      filename: string;
      content: string;
    };
    deleteMessage?: {
      filename: string;
    };
  };
};

async function main() {
  if (process.argv.length <= 2) {
    console.info(`Usage: robot-arm-vr <API URL>`);
    process.exit(1);
  }

  const apiUrl = process.argv[2];
  const dirname = process.cwd();
  const sources = await getSources(dirname);

  await sendMessage(apiUrl, {
    message: {
      type: "START",
      startMessage: {
        files: sources,
      },
    },
  });

  console.info("Start change detection...");

  let previousSources = sources;

  for await (const { filename } of watch(dirname)) {
    await new Promise((resolve) => setTimeout(resolve, 100));

    console.info(`Change detected: filename = ${filename}`);

    const previousFilenames = previousSources.map((source) => source.filename);
    const currentSources = await getSources(dirname);
    const currentFilenames = currentSources.map((source) => source.filename);

    for (const source of previousSources) {
      if (currentFilenames.indexOf(source.filename) < 0) {
        await sendMessage(apiUrl, {
          message: {
            type: "DELETE",
            deleteMessage: {
              filename: source.filename,
            },
          },
        });
      }
    }

    for (const currentSource of currentSources) {
      if (previousFilenames.indexOf(currentSource.filename) < 0) {
        await sendMessage(apiUrl, {
          message: {
            type: "PUT",
            putMessage: {
              filename: currentSource.filename,
              content: currentSource.content,
            },
          },
        });
      }
    }

    const previousSource = previousSources.find(
      (source) => source.filename === filename
    );

    const currentSource = currentSources.find(
      (source) => source.filename === filename
    );

    if (previousSource && currentSource) {
      if (previousSource.content !== currentSource.content) {
        await sendMessage(apiUrl, {
          message: {
            type: "PUT",
            putMessage: {
              filename: currentSource.filename,
              content: currentSource.content,
            },
          },
        });
      }
    }

    previousSources = currentSources;
  }
}

async function getSources(dirname: string) {
  const extnames = [".c", ".h", ".cpp", ".cc", ".hh"];
  const filenames = (await readdir(dirname, { withFileTypes: true }))
    .filter((dirent) => dirent.isFile())
    .map((dirent) => dirent.name)
    .filter((filename) => extnames.indexOf(extname(filename)) >= 0);

  const sources = await Promise.all(
    filenames.map(async (filename) => {
      const content = await readFile(filename, "utf-8");
      return { filename, content };
    })
  );

  return sources;
}

async function sendMessage(apiUrl: string, message: Message) {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(message),
  });

  if (response.status !== 201) {
    console.warn(`Invalid response.status: ${response.status}`);
  }
}

main().catch((err) => console.error(err));
