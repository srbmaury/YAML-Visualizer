import { saveYamlWithVersionHistory } from '../controllers/versionController.js';
import { notifyFileUpdate } from './collaborationService.js';

/**
 * Single path for persisting GitHub-fetched content: YamlFile + VersionHistory + integration row.
 * Uses the same versioning pipeline as the editor so DB "graph" (YAML) and version timeline stay consistent.
 */
export async function persistYamlFromGithubSync({
  yamlFileId,
  content,
  integration,
  commitSha,
}) {
  const id = yamlFileId.toString();

  const msg = commitSha
    ? `GitHub sync (${String(commitSha).slice(0, 7)})`
    : 'GitHub sync (manual)';

  const yamlFile = await saveYamlWithVersionHistory(id, content, integration.user, {
    message: msg,
    saveType: 'auto',
  });

  integration.lastSyncedAt = new Date();
  if (commitSha) {
    integration.lastCommitSha = commitSha;
  }
  await integration.save();

  notifyFileUpdate(id, content);
  return yamlFile;
}
