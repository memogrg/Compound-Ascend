/** Shared device descriptors so the config projects and the setup spec agree. */
import { devices } from "@playwright/test";

export const IPHONE = devices["iPhone 14"] ?? devices["iPhone 13"] ?? {};
export const ANDROID = devices["Pixel 7"] ?? devices["Pixel 5"] ?? {};
