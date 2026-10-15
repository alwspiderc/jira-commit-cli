import { useSite } from '../infra/jira/client.js';
import { loadProjectConfig } from '../infra/storage/project-config.js';

export function openProject() {
  const cfg = loadProjectConfig();
  useSite(cfg.jiraUrl);
  return cfg;
}
