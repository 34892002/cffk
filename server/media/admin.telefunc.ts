import { telefuncAction } from "@/server/telefunc-action";
import { requireAdmin } from "@/server/telefunc-context";
import { getMediaConfig, listMedia, saveMediaConfig, testMediaStorage } from "./service";
import type { MediaConfigInput, MediaListQuery } from "./types";

async function internalOnGetMediaConfig() {
  const { database, runtime } = requireAdmin();
  return getMediaConfig(database, runtime);
}
async function internalOnSaveMediaConfig(input: MediaConfigInput) {
  const { database } = requireAdmin();
  return saveMediaConfig(database, input);
}
async function internalOnTestMediaStorage(input?: MediaConfigInput) {
  const { database, runtime } = requireAdmin();
  return testMediaStorage(database, runtime, input);
}
async function internalOnGetMedia(input: MediaListQuery = {}) {
  const { database } = requireAdmin();
  return listMedia(database, input);
}

export const onGetMediaConfig = telefuncAction(internalOnGetMediaConfig);
export const onSaveMediaConfig = telefuncAction(internalOnSaveMediaConfig);
export const onTestMediaStorage = telefuncAction(internalOnTestMediaStorage);
export const onGetMedia = telefuncAction(internalOnGetMedia);
