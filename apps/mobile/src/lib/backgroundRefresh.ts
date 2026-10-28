import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { z } from 'zod';
import { config } from './config';
import { mergeBaseUrls } from './feedClient';
import { loadSnapshot, refreshSnapshot } from './feedRepository';
import { deviceStorage, readJson, STORAGE_KEYS } from './storage';

export const FEED_REFRESH_TASK = 'feed-refresh';

/** Keeps the cached feed fresh so the app opens on current stories (the OS decides when it runs). */
export async function runFeedRefreshTask(): Promise<BackgroundTask.BackgroundTaskResult> {
  try {
    const savedUrls = await readJson(deviceStorage, STORAGE_KEYS.feedBaseUrls, z.array(z.string()));
    const previous = await loadSnapshot(deviceStorage);
    await refreshSnapshot({
      store: deviceStorage,
      baseUrls: mergeBaseUrls(savedUrls, config.feedBaseUrls),
      ...(previous ? { previous } : {}),
    });
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
}

// Must be defined at module scope so the task exists when the OS starts the app in the background.
TaskManager.defineTask(FEED_REFRESH_TASK, runFeedRefreshTask);

export async function registerBackgroundRefresh(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
    if (await TaskManager.isTaskRegisteredAsync(FEED_REFRESH_TASK)) return;
    await BackgroundTask.registerTaskAsync(FEED_REFRESH_TASK, { minimumInterval: 60 });
  } catch {
    // Background refresh is best-effort.
  }
}
