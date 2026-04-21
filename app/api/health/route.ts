export async function GET() {
  const rawUrl = process.env.DATABASE_URL;

  const result: any = {
    rawUrl: rawUrl,
    rawUrlLength: rawUrl?.length,
    rawUrlCharCodes: rawUrl ? Array.from(rawUrl).map(c => c.charCodeAt(0)) : null,
    rawUrlJSON: JSON.stringify(rawUrl),
  };

  try {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: rawUrl });
    const r = await pool.query('SELECT 1 as ok');
    result.queryOk = r.rows;
    await pool.end();
  } catch (e: any) {
    result.error = {
      message: e?.message,
      code: e?.code,
      errno: e?.errno,
      syscall: e?.syscall,
      hostname: e?.hostname,
      stack: e?.stack?.split('\n').slice(0, 10),
      name: e?.name,
      cause: e?.cause ? { message: e.cause.message, code: e.cause.code, hostname: e.cause.hostname } : null,
    };
  }

  return Response.json(result);
}
