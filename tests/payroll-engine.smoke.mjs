import '../src/modules/payroll-engine.js';

const engine = globalThis.PayrollEngine;
if (!engine) throw new Error('PayrollEngine no quedó disponible en globalThis.');
if (engine.version !== '3.0') throw new Error(`Versión inesperada: ${engine.version}`);

const required = ['dec', 'computeForRequest', 'classifyMinutes', 'fin'];
for (const key of required) {
  if (!engine[key]) throw new Error(`Falta el módulo ${key} del motor.`);
}

console.log('OK payroll-engine smoke: versión 3.0 y módulos principales disponibles.');
