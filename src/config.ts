import fs from "fs";
import os from "os";
import path from "path";

type Config = {
  dbUrl: string;
  currentUserName: string;
};

function getConfigFilePath(): string {
  return path.join(os.homedir(), ".gatorconfig.json");
}

function writeConfig(cfg: Config): void {
  const rawConfig = {
    db_url: cfg.dbUrl,
    current_user_name: cfg.currentUserName,
  };

  const configJson = JSON.stringify(rawConfig, null, 2);

  fs.writeFileSync(getConfigFilePath(), configJson);
}


export function readConfig(): Config {
  const configPath = getConfigFilePath();

  const fileContent = fs.readFileSync(configPath, "utf-8");

  const rawConfig = JSON.parse(fileContent);

  return validateConfig(rawConfig);
}


function validateConfig(rawConfig: any): Config {
  if (typeof rawConfig !== "object" || rawConfig === null) {
    throw new Error("Invalid config: must be an object");
  }

  if (typeof rawConfig.db_url !== "string") {
    throw new Error("Invalid config: db_url must be a string");
  }

  if (typeof rawConfig.current_user_name !== "string") {
    throw new Error(
      "Invalid config: current_user_name must be a string",
    );
  }

  return {
    dbUrl: rawConfig.db_url,
    currentUserName: rawConfig.current_user_name,
  };
}

export function setUser(userName: string): void {
  const configPath = getConfigFilePath();

  const fileContent = fs.readFileSync(configPath, "utf-8");

  const rawConfig = JSON.parse(fileContent);

  const config: Config = {
    dbUrl: rawConfig.db_url,
    currentUserName: userName,
  };

  writeConfig(config);
}
