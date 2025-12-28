// Variable/conditional logic system for the engine

import type { VariableState, VariableValue } from '../types';
import { parseVariables, evaluateCondition } from '../shared/utils';

/**
 * Create initial variable state
 */
export function createVariableState(): VariableState {
  return {};
}

/**
 * Process text and update variables
 */
export function processVariables(
  text: string,
  variables: VariableState
): { text: string; variables: VariableState } {
  const operations = parseVariables(text);
  let result = text;
  const newVariables = { ...variables };

  // Process set/add/sub operations
  for (const op of operations) {
    switch (op.type) {
      case 'set':
        if (op.value !== undefined) {
          newVariables[op.name] = op.value;
        }
        result = result.replace(op.fullMatch, '');
        break;

      case 'add':
        if (typeof op.value === 'number') {
          const current = typeof newVariables[op.name] === 'number'
            ? newVariables[op.name] as number
            : 0;
          newVariables[op.name] = current + op.value;
        }
        result = result.replace(op.fullMatch, '');
        break;

      case 'sub':
        if (typeof op.value === 'number') {
          const current = typeof newVariables[op.name] === 'number'
            ? newVariables[op.name] as number
            : 0;
          newVariables[op.name] = current - op.value;
        }
        result = result.replace(op.fullMatch, '');
        break;
    }
  }

  // Process conditionals
  result = processConditionals(result, newVariables);

  return { text: result, variables: newVariables };
}

/**
 * Process conditional blocks
 */
function processConditionals(text: string, variables: VariableState): string {
  // Handle nested conditionals by processing innermost first
  let result = text;
  let changed = true;

  while (changed) {
    changed = false;

    // Match innermost {if:...}...{/if} blocks (no nested {if inside)
    const regex = /\{if:(\w+)(?:(==|!=|>=|<=|>|<)([^}]+))?\}((?:(?!\{if:)[\s\S])*?)\{\/if\}/gi;

    result = result.replace(regex, (_match, name, operator, value, content) => {
      changed = true;
      const compareValue = value !== undefined ? parseValue(value.trim()) : true;
      const op = operator || '==';

      if (evaluateCondition(variables, name, op, compareValue)) {
        return content;
      }
      return '';
    });
  }

  return result;
}

/**
 * Parse a string value to appropriate type
 */
function parseValue(value: string): VariableValue {
  if (value === 'true') return true;
  if (value === 'false') return false;
  const num = Number(value);
  if (!isNaN(num)) return num;
  return value;
}

/**
 * Get variable value
 */
export function getVariable(variables: VariableState, name: string): VariableValue | undefined {
  return variables[name];
}

/**
 * Set variable value
 */
export function setVariable(
  variables: VariableState,
  name: string,
  value: VariableValue
): VariableState {
  return {
    ...variables,
    [name]: value
  };
}

/**
 * Increment a numeric variable
 */
export function incrementVariable(
  variables: VariableState,
  name: string,
  amount: number = 1
): VariableState {
  const current = typeof variables[name] === 'number' ? variables[name] as number : 0;
  return {
    ...variables,
    [name]: current + amount
  };
}

/**
 * Decrement a numeric variable
 */
export function decrementVariable(
  variables: VariableState,
  name: string,
  amount: number = 1
): VariableState {
  return incrementVariable(variables, name, -amount);
}

/**
 * Toggle a boolean variable
 */
export function toggleVariable(
  variables: VariableState,
  name: string
): VariableState {
  const current = variables[name];
  return {
    ...variables,
    [name]: !current
  };
}

/**
 * Check if variable exists
 */
export function hasVariable(variables: VariableState, name: string): boolean {
  return name in variables;
}

/**
 * Delete a variable
 */
export function deleteVariable(
  variables: VariableState,
  name: string
): VariableState {
  const newVars = { ...variables };
  delete newVars[name];
  return newVars;
}

/**
 * Clear all variables
 */
export function clearVariables(): VariableState {
  return {};
}

/**
 * Get all variable names
 */
export function getVariableNames(variables: VariableState): string[] {
  return Object.keys(variables);
}

/**
 * Create variables panel UI
 */
export function createVariablesPanel(variables: VariableState): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'variables-panel';

  const names = Object.keys(variables);

  if (names.length === 0) {
    panel.style.display = 'none';
    return panel;
  }

  panel.classList.add('visible');
  panel.innerHTML = `
    <h4>Variables</h4>
    ${names.map(name => `
      <div class="variable-item">
        <span class="var-name">${name}</span>
        <span class="var-value">${formatValue(variables[name])}</span>
      </div>
    `).join('')}
  `;

  return panel;
}

/**
 * Update variables panel
 */
export function updateVariablesPanel(panel: HTMLElement, variables: VariableState): void {
  const names = Object.keys(variables);

  if (names.length === 0) {
    panel.classList.remove('visible');
    return;
  }

  panel.classList.add('visible');
  panel.innerHTML = `
    <h4>Variables</h4>
    ${names.map(name => `
      <div class="variable-item">
        <span class="var-name">${name}</span>
        <span class="var-value">${formatValue(variables[name])}</span>
      </div>
    `).join('')}
  `;
}

/**
 * Format a value for display
 */
function formatValue(value: VariableValue): string {
  if (typeof value === 'boolean') {
    return value ? '✓' : '✗';
  }
  return String(value);
}

/**
 * Serialize variables for saving
 */
export function serializeVariables(variables: VariableState): string {
  return JSON.stringify(variables);
}

/**
 * Deserialize variables from saved data
 */
export function deserializeVariables(data: string): VariableState {
  try {
    return JSON.parse(data);
  } catch (e) {
    return {};
  }
}

/**
 * Check if a condition is met
 * Used for conditional choices
 */
export function checkCondition(
  variables: VariableState,
  condition: string
): boolean {
  // Parse condition like "hasKey" or "coins>=10"
  const match = condition.match(/^(\w+)(?:(==|!=|>=|<=|>|<)(.+))?$/);
  if (!match) return false;

  const [, name, operator, value] = match;
  const compareValue = value !== undefined ? parseValue(value.trim()) : true;

  return evaluateCondition(variables, name, operator || '==', compareValue);
}
