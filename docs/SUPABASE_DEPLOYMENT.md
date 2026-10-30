# Guía de Despliegue en Supabase

Esta guía describe el procedimiento exacto y paso a paso para desplegar la base de datos, políticas de seguridad (RLS), almacenamiento, autenticación y funciones de borde (Edge Functions) del **Aplicativo de Gestión de Horas Extras** en Supabase.

---

## 1. Crear o Seleccionar Proyecto en Supabase

1. Ingrese a [Supabase Dashboard](https://supabase.com/dashboard).
2. Cree un nuevo proyecto o seleccione el existente.
3. Copie las credenciales desde **Project Settings > API**:
   - **Project URL** (ejemplo: `https://xxxx.supabase.co`)
   - **anon / public key** (clave pública anónima)
   - **service_role key** (clave de servidor privada, solo para despliegue de Edge Functions o administración interna)

---

## 2. Aplicar la Estructura de Base de Datos y Migraciones

Existen dos métodos para aplicar el esquema:

### Opción A: A través del Supabase SQL Editor (Recomendado)

1. En el Dashboard de Supabase, vaya a **SQL Editor**.
2. Abra y copie el contenido de `supabase/migrations/20261030000000_schema_completo.sql` (o `database/schema_completo.sql`).
3. Pegue el contenido en el editor y haga clic en **Run**.
   - Esto creará:
     - Extensiones (`pgcrypto`).
     - Tipos enumerados (`app_role`, `request_status`).
     - Tablas maestras, transaccionales, auditoría y catálogos.
     - Vistas y secuencias.
     - Funciones de cálculo laboral, triggers y validaciones de servidor.
     - Políticas Row Level Security (RLS) en todas las tablas.
     - Buckets de almacenamiento privado (`overtime-supports`, `manager-signatures`).
     - Suscripciones en tiempo real (`notifications`, `overtime_requests`).
4. Si desea precargar el directorio corporativo de funcionarios de soporte:
   - Abra `supabase/migrations/20261030000001_carga_directorio.sql` (o `database/migrations/carga_directorio_soporte_clientes.sql`).
   - Péguelo en el SQL Editor y ejecútelo con **Run**.

### Opción B: A través de Supabase CLI

```bash
# Iniciar sesión en la CLI con su Personal Access Token
npx supabase login

# Vincular al proyecto remoto
npx supabase link --project-ref <SU_PROJECT_REF>

# Aplicar las migraciones
npx supabase db push
```

---

## 3. Configuración de Autenticación (Authentication)

En el Dashboard de Supabase, configure los siguientes parámetros en **Authentication**:

1. **Authentication > Providers > Email**:
   - **Enable Email provider**: `Activado`
   - **Confirm email**: `Desactivado` *(la migración v9/v10 vincula y habilita automáticamente los perfiles al crearse sin requerir verificación por correo)*.
   - **Allow new users to sign up**: `Desactivado` *(Solo el administrador puede crear cuentas de funcionarios autorizados)*.
2. **Authentication > URL Configuration**:
   - **Site URL**: URL pública donde se publicará el aplicativo (ej. `https://mi-empresa.github.io/aplicativo-gestion-horas-extra/`).
   - **Redirect URLs**: Agregue la misma URL de producción y `http://localhost:5173` para desarrollo local.
3. **Authentication > Policies**:
   - Longitud mínima de contraseña: `8` caracteres recomendados.

---

## 4. Asignar el Primer Administrador

Tras crear el primer usuario en **Authentication > Users** (por ejemplo `jaime.rizo@essa.com.co` o el correo del administrador):

Ejecute en el **SQL Editor**:

```sql
update public.profiles
   set role = 'admin',
       active = true
 where email = 'correo_del_administrador@essa.com.co';

-- Sincronizar directorio para vincular nómina
select public.admin_sync_directory();
```

---

## 5. Desplegar la Edge Function `admin-set-password`

El aplicativo cuenta con una función de servidor protegida para que los administradores gestionen contraseñas temporales, enlaces de recuperación y restablecimiento a cédula de forma segura.

### Despliegue con Supabase CLI:

```bash
# Desplegar la función
npx supabase functions deploy admin-set-password --project-ref <SU_PROJECT_REF>

# (Opcional) Configurar la URL de redirección para enlaces de recuperación:
npx supabase secrets set APP_URL=https://su-aplicativo.com --project-ref <SU_PROJECT_REF>
```

---

## 6. Configurar el Aplicativo Frontend (.env)

En la raíz del proyecto local o en las variables de entorno de su proveedor de hosting (GitHub Pages / Vercel / Netlify / Azure):

```dotenv
VITE_SUPABASE_URL=https://<SU_PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<SU_PUBLIC_ANON_KEY>
VITE_BASE_PATH=./
```

> **IMPORTANTE DE SEGURIDAD**: Nunca exponga la clave `service_role` en variables que inicien con `VITE_`. El frontend solo debe recibir la clave pública `anon`.
