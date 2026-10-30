# Fase 1 · Auditoría integral previa a la migración

## Alcance y huella

- Archivo principal original: 1.440.706 bytes, 10.850 líneas, SHA-256 `61b33e93eefd451799282ea73e237df03eb8ae569c6782f900856eb017005d10`.
- CSS embebido: 432.264 caracteres, aproximadamente 3.859 reglas, 422 variables CSS, 117 bloques `@keyframes` y 79 media queries.
- JavaScript embebido: motor de cálculo de 26.183 caracteres, núcleo funcional de 661.486 caracteres y capa de configuración/UX de 53.971 caracteres.
- SQL embebido: 204.524 caracteres.
- DOM estático: 8 páginas, 146 IDs contando scripts, 99 controles, 72 botones y un formulario de acceso; no se encontraron IDs estáticos duplicados.
- Recurso PNG base64: logo de 105 × 72 px, 7.068 bytes.

## Tecnologías y dependencias

- HTML5, CSS3 y JavaScript ES6+ sin framework.
- Supabase JS v2 por CDN para Auth, PostgREST/RPC, Storage, Functions y Realtime.
- Chart.js 4.4.7 por CDN.
- Lucide 0.468.0 por CDN.
- Fuente Inter desde Google Fonts con carga no bloqueante.
- IndexedDB para borradores; `localStorage` y `sessionStorage` para preferencias, backend local, sesión y límites de intentos.
- Motor financiero/laboral propio con `BigInt` para aritmética decimal exacta.

## Puntos de entrada y navegación

El único punto de entrada era el HTML. La navegación se gestiona con `data-page` y ocho secciones: Dashboard, Solicitudes, Reportes, Bandeja de gestión, Auxilios de alimentación, Gestión financiera, Funcionarios y Configuración. La visibilidad cambia según los roles `employee`, `professional`, `manager` y `admin`.

## Funcionalidades identificadas

- Autenticación, sesión persistente, cierre de sesión, recuperación/cambio de contraseña y contraseña temporal obligatoria.
- Backend local de prueba compatible con la interfaz Supabase.
- Solicitudes, estados, aprobaciones, validaciones, solapamientos, borradores offline y adjuntos.
- Reportes, CSV, impresión, PDF/SVG y exportación XLSX construida en cliente.
- Cálculo laboral, recargos, reglas por vigencia, salarios, sindicatos, auxilios y análisis financiero.
- Catálogos, parámetros, directorio, perfiles, firmas, auditoría y notificaciones en tiempo real.
- Temas claro/oscuro, sidebar adaptable, modales, tabs, selectores personalizados, tooltips, animaciones y estados responsive.

## Integraciones y seguridad

- La configuración de despliegue estaba vacía en el original y permitía URL/clave pública en almacenamiento local.
- No se encontró una clave real, JWT, `service_role` ni secreto de API en el frontend entregado.
- Las migraciones incluyen RLS, funciones `security definer`, privilegios, políticas de Storage y operaciones reservadas para `service_role` desde Edge Functions.
- Riesgo identificado: introducir un secreto en `VITE_*` lo expondría en el bundle. Solo se permiten URL y clave pública anon/publishable.

## Problemas de mantenimiento y rendimiento

1. Un único archivo de 1,44 MB mezclaba HTML, CSS, SQL, motor de cálculo, backend local y UI.
2. La caché era de todo o nada: un cambio mínimo invalidaba el archivo completo.
3. El SQL se analizaba y transportaba dentro del HTML aunque la mayoría de usuarios nunca abre la instalación técnica.
4. El logo PNG se repetía como cadena base64 dentro de salidas generadas y no tenía caché independiente.
5. La configuración de despliegue exigía editar código.
6. El núcleo usa una clausura compartida muy extensa. Dividirla indiscriminadamente habría creado riesgo alto de regresión en estado, eventos y permisos.
7. El CSS contiene muchos estados dinámicos. No era seguro eliminar selectores por análisis estático porque gran parte del DOM se genera en tiempo de ejecución.

## Dependencias obsoletas, duplicadas o incompatibles

- No se detectaron cargas duplicadas de Supabase, Chart.js o Lucide.
- Chart.js y Lucide estaban fijados y se conservaron para evitar cambios visuales o de API.
- Supabase estaba en el canal mayor `@2`; se conservó para no alterar el contrato.
- No se añadió React, framework, polyfill o utilidad redundante.

## Riesgos de regresión y estrategia aplicada

- **Diseño:** extracción byte-equivalente del CSS; no se renombraron clases, variables ni breakpoints.
- **DOM/eventos:** conservación de todos los nodos estáticos, IDs, `data-*` e inline handlers.
- **Estado compartido:** el núcleo se mantuvo como una unidad cohesionada; se separaron solo límites ya existentes: motor, aplicación y UX de configuración.
- **Configuración:** puente `window.__APP_CONFIG__` alimentado por `.env`, conservando el fallback de almacenamiento local.
- **SQL:** extracción a archivo estático cargado antes del núcleo para que la pantalla técnica siga mostrando el esquema completo.
- **Recursos:** PNG extraído a asset Vite con hash sin recomprimir ni degradar.
- **Pruebas:** comparación original/migrado con los mismos roles, resoluciones y navegador.

Los datos detallados y checksums se encuentran en `docs/audit-manifest.json` y `docs/verification/structure-equivalence.json`.
