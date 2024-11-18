#!/usr/bin/env node
import { Command } from 'commander';
import { aiCommand } from './commands/ai';
import { componentCommand } from './commands/component';
import { projectCommand } from './commands/project';
import { prototypeCommand } from './commands/prototype';

const program = new Command();

aiCommand(program);
componentCommand(program);
projectCommand(program);
prototypeCommand(program);

program.parse(process.argv);
