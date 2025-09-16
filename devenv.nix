{ pkgs, lib, config, inputs, ... }:

{

  dotenv.enable = true;

  packages = [
    pkgs.git
    pkgs.go
    pkgs.nodejs
  ];


}
