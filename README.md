# Aplicativo de Gestión de Horas Extras · Vite

Migración directa del archivo monolítico `Aplicativo_Gestion_Horas_Extra.html` a una aplicación Vite, sin React ni otro framework. La estructura, estilos, IDs, controles, flujos y backend local del original se conservaron; el código quedó separado por responsabilidad y se entrega con `dist/` compilado.

## Requisitos

- Node.js 20.19 o superior.
- npm 10 o superior.
- Para producción real: proyecto Supabase configurado y migraciones revisadas/aplicadas.

## Configuración

```bash
cp .env.example .env
```

Complete únicamente variables públicas:

```dotenv
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=su-clave-publica-anon-o-publishable
VITE_BASE_PATH=./
```

Nunca coloque `service_role`, secretos de Edge Functions ni credenciales privadas en variables `VITE_*`: Vite las incorpora al frontend.

Si no se configuran las variables de Supabase, la aplicación conserva el backend local de prueba del original y crea usuarios de demostración en el almacenamiento del navegador.

## Ejecución

```bash
npm install
npm run dev
```

Abrir `http://localhost:5173`.

## Validación y producción

```bash
npm run typecheck
npm test
npm run build
npm run preview
```

El resultado compilado queda en `dist/`. `VITE_BASE_PATH=./` permite publicar bajo subcarpetas y hosting estático. Se incluyen `_redirects` y `staticwebapp.config.json` para hosts compatibles.

## Scripts

- `npm run dev`: servidor Vite de desarrollo.
- `npm run typecheck`: validación TypeScript sin emitir archivos.
- `npm test`: prueba de humo del motor de cálculo.
- `npm run build`: typecheck y compilación de producción.
- `npm run preview`: servidor local del build.
- `npm run check`: typecheck, prueba de humo y build.
- `npm run test:functional:migrated`: prueba CDP del aplicativo migrado; requiere servidor activo y Chromium en `CHROME_PATH` si no está en la ruta predeterminada del entorno de validación.

## Base de datos

- Proyecto nuevo: revisar y ejecutar `database/schema_completo.sql` en un entorno controlado.
- Proyecto existente: respaldar y revisar las migraciones de `database/migrations/` antes de aplicarlas. No ejecutar nuevamente todo el esquema sin comparar el estado real.
- La carga `carga_directorio_soporte_clientes.sql` contiene datos de directorio y debe tratarse como información corporativa.

## Estructura principal

```text
public/                         Archivos estáticos y reglas de hosting
src/
  assets/                      Logo PNG extraído del base64
  config/runtime.ts            Variables públicas de despliegue
  modules/payroll-engine.js    Motor puro de cálculo
  modules/config-ux.js         Mejora progresiva de configuración
  scripts/app.js               Núcleo funcional conservado
  styles/app.css               CSS completo conservado
  types/globals.d.ts           Contratos de globals heredados
  utils/bootstrap-error.ts     Error de arranque visible y controlado
  main.ts                      Bootstrap y orden de carga

database/                      Esquema y migraciones SQL
docs/                          Auditoría, informe y evidencias
tests/                         Pruebas de humo y funcionales
legacy/                        HTML original inalterado para trazabilidad
dist/                          Build de producción verificado
```

Consulte `docs/INFORME_FINAL.md` para resultados, cambios, métricas, verificaciones y limitaciones.
