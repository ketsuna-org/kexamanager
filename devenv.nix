{ pkgs, lib, config, inputs, ... }:

{

  dotenv.enable = true;

  packages = [
    pkgs.git
    pkgs.awscli
  ];

  languages = {
    go.enable = true;
    javascript.enable = true;
    javascript.bun.enable = true;
  };

  processes.api.exec = "cd api && PORT=8080 go run ./cmd/proxy";
  processes.front.exec = "cd front && bun dev";

}
