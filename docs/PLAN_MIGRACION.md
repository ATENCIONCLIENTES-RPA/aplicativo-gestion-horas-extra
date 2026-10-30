# Plan de migración ejecutado

1. **Auditoría:** inventario de estructura, estilos, scripts, SQL, recursos, integraciones, almacenamiento, roles, navegación y riesgos.
2. **Preservación:** copia original inalterada y manifiesto SHA-256; comparación estructural automatizada.
3. **Migración:** creación de `index.html`, bootstrap TypeScript y configuración Vite portable.
4. **Refactorización segura:** extracción del motor laboral, núcleo funcional, UX de configuración, CSS, SQL, configuración y recursos.
5. **Optimización:** asset PNG cacheable, SQL fuera del bundle crítico, chunks dinámicos, carga ociosa de UX no crítica, minificación y hashes.
6. **Seguridad:** variables públicas en `.env`, `.gitignore`, ausencia de credenciales reales y conservación de RLS/migraciones.
7. **Verificación:** typecheck, sintaxis JS, prueba del motor, build, dev, preview, navegación por roles, modales, SQL técnico y comparaciones visuales.
8. **Entrega:** código fuente, `dist`, informes, pruebas, evidencias y HTML original de trazabilidad dentro del ZIP.

## Decisiones deliberadas

- No se eliminó CSS aparentemente no usado porque hay HTML dinámico y estados por rol.
- No se fragmentó la gran clausura del núcleo en módulos artificiales: sus funciones comparten estado, índices, listeners y permisos. La separación aplicada coincide con fronteras funcionales comprobables.
- No se actualizó Supabase a otro mayor ni se cambiaron Chart.js/Lucide.
- No se añadieron frameworks ni librerías de UI.
