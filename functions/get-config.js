export async function onRequest(context) {
  // 从 Cloudflare 环境变量中读取 Key
  const anonKey = context.env.SUPABASE_ANON_KEY;

  // 如果变量未配置，返回错误
  if (!anonKey) {
    return new Response(JSON.stringify({ error: "Config missing in Cloudflare" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 返回 JSON 格式的配置
  return new Response(JSON.stringify({
    SUPABASE_ANON_KEY: anonKey
  }), {
    headers: { "Content-Type": "application/json" },
  });
}
