import type { Config } from "vike/types";
import vikeVue from "vike-vue/config";

// Default config (can be overridden by pages)
// https://vike.dev/config

const config: Config = {
  title: "欢迎光临",
  description: "",

  passToClient: ["user", "isAdmin"],
  extends: [vikeVue],
};

export default config;
