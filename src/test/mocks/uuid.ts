// Mock CommonJS do pacote `uuid` (ESM puro na v14, incompatível com o runtime
// CommonJS do Jest). Usado apenas nos testes via moduleNameMapper no jest.config.js.
// Gera valores únicos e estáveis o suficiente para asserts de unidade.
let counter = 0;
export const v4 = (): string => {
  counter += 1;
  const n = String(counter).padStart(12, '0');
  return `00000000-0000-4000-8000-${n}`;
};
