import { NextResponse } from "next/server";

export async function GET() {
  const allKeys = Object.keys(process.env).sort();
  const dbKeys = allKeys.filter(k => k.toLowerCase().includes('database') || k.toLowerCase().includes('db'));

  return NextResponse.json({
    pid: process.pid,
    ppid: process.ppid,
    nodeEnv: process.env.NODE_ENV,
    dbUrlDirect: process.env.DATABASE_URL ?? null,
    dbUrlBracket: process.env['DATABASE_URL'] ?? null,
    dbUrlType: typeof process.env.DATABASE_URL,
    dbRelatedKeys: dbKeys,
    totalEnvKeys: allKeys.length,
    cwd: process.cwd(),
    execPath: process.execPath,
    argv: process.argv,
  });
}
