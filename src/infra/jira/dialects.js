import { adfDocument } from '../../core/adf.js';
import { wikiText } from '../../core/wiki.js';

const EPIC_LEVEL = 1;
const EPIC_NAME = /^(epic|épico)$/i;

// Jira Server/Data Center: API v2, texto em wiki markup em vez de ADF, responsável pelo nome
// de usuário e épico pelo campo "Epic Link", não pelo parent
export const DIALECTS = {
  cloud: {
    api: '/rest/api/3',
    searchPath: '/rest/api/3/search/jql',
    assignee: (me) => ({ accountId: me.accountId }),
    document: adfDocument,
    isEpic: (type) => type.level === EPIC_LEVEL,
    epicByParent: true,
  },
  server: {
    api: '/rest/api/2',
    searchPath: '/rest/api/2/search',
    assignee: (me) => ({ name: me.name }),
    document: wikiText,
    isEpic: (type) => EPIC_NAME.test(type.name),
    epicByParent: false,
  },
};
