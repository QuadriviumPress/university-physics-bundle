/**
 * Shared reporting utilities for the build/verify scripts.
 *
 * Consistent terminal output formatting via chalk.
 */

import chalk from 'chalk';

/**
 * Print a styled header for a script.
 * @param {string} emoji - Emoji to display
 * @param {string} title - Script title
 */
export function printHeader(emoji, title) {
  console.log(chalk.blue.bold(`${emoji} ${title}`));
  printDivider();
}

/** Print a divider line. */
export function printDivider() {
  console.log(chalk.gray('─'.repeat(60)));
}

/**
 * Print a success message.
 * @param {string} message - Success message
 */
export function printSuccess(message) {
  console.log(chalk.green(`✅ ${message}`));
}

/**
 * Print final summary.
 * @param {number} errors - Number of errors
 * @param {number} warnings - Number of warnings
 */
export function printSummary(errors, warnings) {
  printDivider();
  console.log(chalk.gray(`Summary: ${errors} errors, ${warnings} warnings`));
}

/**
 * Print help text for a script.
 * @param {Object} options - Help options
 */
export function printHelp({ usage, description, options = [], examples = [] }) {
  console.log(`
${chalk.bold('Usage:')} ${usage}

${description}

${chalk.bold('Options:')}
${options.map(opt => `  ${opt.flag.padEnd(20)} ${opt.description}`).join('\n')}
${
  examples.length > 0
    ? `
${chalk.bold('Examples:')}
${examples.map(ex => `  ${ex}`).join('\n')}`
    : ''
}
`);
}
