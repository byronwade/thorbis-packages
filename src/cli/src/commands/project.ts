import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs/promises';
import { logger } from '../utils/logger';

const MOCK_BUTTON_COMPONENT = `
import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  onClick, 
  variant = 'primary' 
}) => {
  return (
    <button
      onClick={onClick}
      className={\`thorbis-button \${variant}\`}
    >
      {children}
    </button>
  );
};
`;

async function ensureThorbisDirectory() {
  const thorbisDir = path.join(process.cwd(), '.thorbis');
  const componentsDir = path.join(thorbisDir, 'components');

  await fs.mkdir(componentsDir, { recursive: true });
  return componentsDir;
}

async function generateMockComponent(componentsDir: string) {
  const buttonPath = path.join(componentsDir, 'Button.tsx');
  await fs.writeFile(buttonPath, MOCK_BUTTON_COMPONENT);
  return buttonPath;
}

type StepResult = string | undefined;
type Step = {
  name: string;
  action: (previousResult: StepResult) => Promise<StepResult>;
};

export const projectCommand = (program: Command) => {
  program
    .command('project')
    .description('Create a new project')
    .action(async () => {
      const steps: Step[] = [
        {
          name: 'Initialize',
          action: async () => {
            // Project initialization
            return 'initialized';
          },
        },
      ];

      let previousResult: StepResult;
      for (const step of steps) {
        const spinner = ora(`${step.name}...`).start();
        try {
          previousResult = await step.action(previousResult);
          spinner.succeed();
        } catch (error) {
          spinner.fail();
          throw error;
        }
      }
    });
};
