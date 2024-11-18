import { Command } from 'commander';
import type { QuestionCollection } from 'inquirer';
import inquirer from 'inquirer';
import { logger } from '../utils/logger';
import { loadConfig } from '../utils/config';

type ComponentOptions = {
  name: string;
  type?: string;
};

export const componentCommand = (program: Command) => {
  program
    .command('component')
    .description('Create a new component')
    .argument('<name>', 'Component name')
    .option('-t, --type <type>', 'Component type')
    .action(async (name: string, options: ComponentOptions) => {
      // Component command implementation
      console.log(`Creating component: ${name}`);
    });
};
