// Declaración ambiente para imports de CSS con efecto secundario.
// TS 6 (TS2882) exige una declaración para `import "./globals.css"`; Next
// procesa el CSS real en build, esto solo satisface al type-checker.
declare module "*.css";
