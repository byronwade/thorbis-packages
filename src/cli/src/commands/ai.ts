import { Command } from 'commander';
import chalk from 'chalk';
import { logger } from '../utils/logger';

type AICommandOptions = {
  component: string;
};

export const aiCommand = (program: Command) => {
  program
    .command('ai')
    .description('Generate AI components')
    .argument('<component>', 'Component name to generate')
    .action((component: string) => {
      logger.info(`Generating AI component: ${component}`);
    });
};
