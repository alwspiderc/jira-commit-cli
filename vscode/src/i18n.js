import * as vscode from 'vscode';
import { setLanguage } from '../../src/i18n/index.js';

// Mesma ordem da CLI, trocando o idioma do sistema pelo do editor: o "language" do
// .jira-commit.json vale primeiro; sem ele, o idioma do VS Code (pt* → pt, o resto → en)
export function applyLanguage(cfg) {
  setLanguage(cfg?.language ?? (vscode.env.language.toLowerCase().startsWith('pt') ? 'pt' : 'en'));
}
