import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function errorMessage(cause: unknown) {
  if (cause instanceof Error && cause.message) return cause.message;
  if (cause && typeof cause === "object") {
    const record = cause as Record<string, unknown>;
    const message = [record.message, record.details, record.hint]
      .find((value) => typeof value === "string" && value.trim());
    if (typeof message === "string") return message;
  }
  return "No pudimos guardar la conexión.";
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptSecret(secret: string) {
  const encodedKey = Deno.env.get("EDITOR_CONNECTION_ENCRYPTION_KEY") ?? "";
  const rawKey = base64ToBytes(encodedKey);
  if (rawKey.byteLength !== 32) throw new Error("La clave de cifrado del editor no está configurada.");
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
  const initializationVector = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: initializationVector },
    key,
    new TextEncoder().encode(secret),
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    initializationVector: bytesToBase64(initializationVector),
  };
}

async function decryptSecret(ciphertext: string, initializationVector: string) {
  const encodedKey = Deno.env.get("EDITOR_CONNECTION_ENCRYPTION_KEY") ?? "";
  const rawKey = base64ToBytes(encodedKey);
  if (rawKey.byteLength !== 32) throw new Error("La clave de cifrado del editor no está configurada.");
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(initializationVector) },
    key,
    base64ToBytes(ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}

function databaseIdentifier(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{0,62}$/.test(value)) {
    throw new Error(`${label} no es válido.`);
  }
  return value;
}

function parseProjectUrl(value: unknown) {
  if (typeof value !== "string") throw new Error("La URL del proyecto es obligatoria.");
  const url = new URL(value);
  const match = url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
  if (url.protocol !== "https:" || !match || url.pathname !== "/") {
    throw new Error("Usa una URL de proyecto válida de Supabase.");
  }
  return { projectRef: match[1], projectUrl: url.origin };
}

function namedKey(environmentName: string, legacyName: string) {
  const namedKeys = Deno.env.get(environmentName);
  if (namedKeys) {
    const parsed = JSON.parse(namedKeys) as Record<string, string>;
    const key = parsed.default ?? Object.values(parsed)[0];
    if (key) return key;
  }
  return Deno.env.get(legacyName) ?? "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const publishableKey = namedKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    const editorSecretKey = namedKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("Authorization") ?? "";
    const accessToken = authorization.replace(/^Bearer\s+/i, "");
    if (!accessToken) return json({ error: "Inicia sesión en el editor." }, 401);
    const authClient = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false } });
    const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
    if (userError || !userData.user) return json({ error: "La sesión del editor no es válida." }, 401);
    const ownerId = userData.user.id;
    const supabaseAdmin = createClient(supabaseUrl, editorSecretKey, { auth: { persistSession: false } });
    const body = await req.json() as Record<string, unknown>;
    const editorProjectId = typeof body.editorProjectId === "string" ? body.editorProjectId : "";
    if (!editorProjectId) return json({ error: "Selecciona un proyecto del editor." }, 400);

    const { data: ownedProject, error: projectError } = await supabaseAdmin
      .from("editor_projects")
      .select("id")
      .eq("id", editorProjectId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!ownedProject) return json({ error: "No tienes acceso a este proyecto." }, 403);

    if (body.action === "delete") {
      const { error } = await supabaseAdmin
        .from("editor_supabase_connections")
        .delete()
        .eq("editor_project_id", editorProjectId)
        .eq("owner_id", ownerId);
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === "verify-table") {
      const tableName = databaseIdentifier(body.tableName, "El nombre de la tabla");
      const columns = Array.isArray(body.columns)
        ? body.columns.map((column) => databaseIdentifier(column, "Un campo"))
        : [];
      if (!columns.length || columns.length > 100) {
        return json({ error: "Selecciona entre 1 y 100 campos para comprobar." }, 400);
      }
      const { data: connection, error: connectionReadError } = await supabaseAdmin
        .from("editor_supabase_connections")
        .select("id,project_url")
        .eq("editor_project_id", editorProjectId)
        .eq("owner_id", ownerId)
        .maybeSingle();
      if (connectionReadError) throw connectionReadError;
      if (!connection) return json({ error: "Guarda primero el acceso privado del editor." }, 400);

      const { data: storedSecret, error: secretReadError } = await supabaseAdmin
        .from("editor_connection_secrets")
        .select("ciphertext,initialization_vector")
        .eq("connection_id", connection.id)
        .maybeSingle();
      if (secretReadError) throw secretReadError;
      if (!storedSecret) return json({ error: "La conexión privada no tiene una secret key guardada." }, 400);

      const secretKey = await decryptSecret(storedSecret.ciphertext, storedSecret.initialization_vector);
      const targetAdmin = createClient(connection.project_url, secretKey, { auth: { persistSession: false } });
      const { data: records, error: tableError } = await targetAdmin
        .from(tableName)
        .select(columns.join(","))
        .limit(1);
      if (tableError) {
        return json({ error: `No pudimos comprobar ${tableName}: ${tableError.message}` }, 400);
      }
      return json({ hasRows: Array.isArray(records) && records.length > 0 });
    }

    if (body.action !== "save") return json({ error: "Acción no válida." }, 400);
    const { projectRef, projectUrl } = parseProjectUrl(body.projectUrl);
    const targetPublishableKey = typeof body.publishableKey === "string" ? body.publishableKey.trim() : "";
    const secretKey = typeof body.secretKey === "string" ? body.secretKey.trim() : "";
    if (!targetPublishableKey.startsWith("sb_publishable_")) {
      return json({ error: "Usa una publishable key válida." }, 400);
    }
    if (!secretKey.startsWith("sb_secret_")) {
      return json({ error: "Usa una secret key nueva de Supabase que comience con sb_secret_." }, 400);
    }

    const targetAdmin = createClient(projectUrl, secretKey, { auth: { persistSession: false } });
    const { error: targetAuthError } = await targetAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (targetAuthError) {
      return json({ error: `La secret key no pudo administrar este proyecto: ${targetAuthError.message}` }, 400);
    }

    const encrypted = await encryptSecret(secretKey);
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("editor_supabase_connections")
      .select("id")
      .eq("editor_project_id", editorProjectId)
      .maybeSingle();
    if (existingError) throw existingError;
    const connectionId = existing?.id ?? crypto.randomUUID();
    const connection = {
      id: connectionId,
      owner_id: ownerId,
      editor_project_id: editorProjectId,
      project_ref: projectRef,
      project_url: projectUrl,
      publishable_key: targetPublishableKey,
      secret_hint: `sb_secret_••••${secretKey.slice(-4)}`,
      verified_at: new Date().toISOString(),
    };
    const { error: connectionError } = await supabaseAdmin
      .from("editor_supabase_connections")
      .upsert(connection, { onConflict: "editor_project_id" });
    if (connectionError) throw connectionError;

    const { error: secretError } = await supabaseAdmin
      .from("editor_connection_secrets")
      .upsert({
        connection_id: connectionId,
        ciphertext: encrypted.ciphertext,
        initialization_vector: encrypted.initializationVector,
      });
    if (secretError) throw secretError;

    return json({ connection: {
      editor_project_id: editorProjectId,
      project_ref: projectRef,
      project_url: projectUrl,
      publishable_key: targetPublishableKey,
      secret_hint: connection.secret_hint,
      verified_at: connection.verified_at,
    } });
  } catch (cause) {
    console.error("manage-editor-connection failed", cause);
    return json({ error: errorMessage(cause) }, 500);
  }
});
