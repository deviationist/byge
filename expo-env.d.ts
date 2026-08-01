/// <reference types="expo/types" />

// Uniwind compiles global.css through Metro; TypeScript needs to know the
// side-effect import is legitimate.
declare module "*.css";
