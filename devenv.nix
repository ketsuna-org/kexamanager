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

}
