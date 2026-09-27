import { beforeEach, describe, expect, it } from "vitest";

import {
  VISUAL_MODEL_DOWNLOAD_ACK_STORAGE_KEY,
  readVisualModelDownloadAcknowledgement,
  writeVisualModelDownloadAcknowledgement,
} from "../src/app/input-preferences";

describe("visual model download acknowledgement", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("is off until the shopper explicitly acknowledges the first-use model download", () => {
    expect(readVisualModelDownloadAcknowledgement()).toBe(false);

    writeVisualModelDownloadAcknowledgement();

    expect(window.localStorage.getItem(VISUAL_MODEL_DOWNLOAD_ACK_STORAGE_KEY)).toBe("1");
    expect(readVisualModelDownloadAcknowledgement()).toBe(true);
  });

  it("does not accept arbitrary stored values as acknowledgement", () => {
    window.localStorage.setItem(VISUAL_MODEL_DOWNLOAD_ACK_STORAGE_KEY, "yes");

    expect(readVisualModelDownloadAcknowledgement()).toBe(false);
  });
});
