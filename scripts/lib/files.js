/**
 * Shared file utilities for the build/verify scripts.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Get the base directory of the project.
 * @param {string} importMetaUrl - import.meta.url of the calling script
 * @returns {string} - Base directory path
 */
export function getBaseDir(importMetaUrl) {
  // Go up from scripts/ to project root
  return path.join(path.dirname(fileURLToPath(importMetaUrl)), '..');
}

/**
 * Read a file and return its content.
 * @param {string} filePath - Path to file
 * @param {string} encoding - File encoding (default: utf-8)
 * @returns {string} - File content
 */
export function readFile(filePath, encoding = 'utf-8') {
  return fs.readFileSync(filePath, encoding);
}

/**
 * Write content to a file.
 * @param {string} filePath - Path to file
 * @param {string} content - Content to write
 * @param {string} encoding - File encoding (default: utf-8)
 */
export function writeFile(filePath, content, encoding = 'utf-8') {
  fs.writeFileSync(filePath, content, encoding);
}
