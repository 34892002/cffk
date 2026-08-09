import { appError } from "@/lib/app-error";
import { requireAdmin } from "@/server/telefunc-context";
import { deleteMedia, getMediaConfig, listMedia, saveMediaConfig, testMediaStorage } from "./service";
import type { MediaConfigInput, MediaListQuery } from "./types";

export async function onGetMediaConfig() {
  const { database, runtime } = requireAdmin();
  return getMediaConfig(database, runtime);
}
export async function onSaveMediaConfig(input: MediaConfigInput) {
  const { database } = requireAdmin();
  return saveMediaConfig(database, input);
}
export async function onTestMediaStorage(input?: MediaConfigInput) {
  const { database, runtime } = requireAdmin();
  return testMediaStorage(database, runtime, input);
}
export async function onGetMedia(input: MediaListQuery = {}) {
  const { database } = requireAdmin();
  return listMedia(database, input);
}
export async function onDeleteMedia(input: { id: number }) {
  const { database, runtime } = requireAdmin();
  if (!Number.isInteger(input.id) || input.id < 1) appError("MEDIA_NOT_FOUND");
  return deleteMedia(database, runtime, input.id);
}
